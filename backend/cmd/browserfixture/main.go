// browserfixture creates disposable schemas for the serial browser regression
// runner. It deliberately accepts only a loopback TEST_DATABASE_DSN URL.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var schemaPattern = regexp.MustCompile(`^e2e_[a-z0-9_]+$`)

func main() {
	if err := run(os.Args[1:], os.Getenv("TEST_DATABASE_DSN"), os.Stdout); err != nil {
		// Do not print driver errors: they can contain the DSN or credentials.
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func fixtureDSN(raw, schema string) (string, error) {
	if len(schema) > 63 || !schemaPattern.MatchString(schema) {
		return "", errors.New("invalid fixture schema")
	}
	invalidURL := errors.New("TEST_DATABASE_DSN must be a loopback PostgreSQL URL with supported options")
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Opaque != "" || parsed.Fragment != "" || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") {
		return "", invalidURL
	}
	switch parsed.Hostname() {
	case "127.0.0.1", "localhost", "::1":
	default:
		return "", invalidURL
	}
	if port := parsed.Port(); port != "" {
		value, err := strconv.Atoi(port)
		if err != nil || value < 1 || value > 65535 {
			return "", invalidURL
		}
	}
	query, err := url.ParseQuery(parsed.RawQuery)
	if err != nil {
		return "", invalidURL
	}
	// libpq-style host/service/options query arguments can redirect an apparently
	// local URL or override session isolation. This helper needs only these four.
	for name := range query {
		switch name {
		case "sslmode", "application_name", "connect_timeout", "search_path":
		default:
			return "", invalidURL
		}
	}
	query.Set("search_path", schema)
	query.Set("connect_timeout", "10")
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

func run(args []string, rawDSN string, stdout io.Writer) error {
	if len(args) != 2 || (args[0] != "create" && args[0] != "drop") {
		return errors.New("usage: browserfixture create|drop <e2e_schema>")
	}
	dsn, err := fixtureDSN(rawDSN, args[1])
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	failed := errors.New("fixture database operation failed")
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent), DisableAutomaticPing: true})
	if err != nil {
		return failed
	}
	pool, err := db.DB()
	if err != nil {
		return failed
	}
	defer pool.Close()
	pool.SetMaxOpenConns(1)
	pool.SetMaxIdleConns(1)
	if err := pool.PingContext(ctx); err != nil {
		return failed
	}
	// The identifier is validated to ASCII lowercase letters, digits and '_'
	// before reaching this point, and is quoted as one PostgreSQL identifier.
	identifier := `"` + args[1] + `"`
	statement := "CREATE SCHEMA " + identifier
	if args[0] == "drop" {
		statement = "DROP SCHEMA IF EXISTS " + identifier + " CASCADE"
	}
	if err := db.WithContext(ctx).Exec(statement).Error; err != nil {
		return failed
	}
	if args[0] == "create" {
		if err := json.NewEncoder(stdout).Encode(struct {
			DSN string `json:"dsn"`
		}{DSN: dsn}); err != nil {
			return errors.New("could not write fixture connection result")
		}
	}
	return nil
}
