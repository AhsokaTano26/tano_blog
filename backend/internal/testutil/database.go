// Package testutil provides isolated PostgreSQL schemas for integration tests.
package testutil

import (
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"net/url"
	"os"
	"testing"
)

func Database(t *testing.T, models ...interface{}) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_DSN")
	if dsn == "" {
		if os.Getenv("REQUIRE_TEST_DATABASE") == "1" {
			t.Fatal("TEST_DATABASE_DSN is required: integration tests must not be skipped in CI")
		}
		t.Skip("TEST_DATABASE_DSN is required for PostgreSQL integration tests")
	}
	root, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	pool, _ := root.DB()
	t.Cleanup(func() { pool.Close() })
	schema := "perf_test_" + uuid.New().String()[:8]
	if err := root.Exec("CREATE SCHEMA " + schema).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { root.Exec("DROP SCHEMA " + schema + " CASCADE") })
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	db, err := gorm.Open(postgres.Open(u.String()), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	scopedPool, _ := db.DB()
	t.Cleanup(func() { scopedPool.Close() })
	if err := db.AutoMigrate(models...); err != nil {
		t.Fatal(err)
	}
	return db
}
