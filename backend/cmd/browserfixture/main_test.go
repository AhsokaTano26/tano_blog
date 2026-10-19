package main

import (
	"bytes"
	"net/url"
	"strings"
	"testing"
)

func TestFixtureSchemaIsRestrictedToDisposableIdentifiers(t *testing.T) {
	for _, schema := range []string{"", "public", "e2e_", "e2e_Test", "e2e_test;DROP SCHEMA public", "e2e_\"", "e2e_test-name", "e2e_" + strings.Repeat("a", 60)} {
		if _, err := fixtureDSN("postgres://test:private-password@127.0.0.1:5432/test?sslmode=disable", schema); err == nil {
			t.Errorf("accepted unsafe schema %q", schema)
		}
	}
	for _, schema := range []string{"e2e_test_123", "e2e_" + strings.Repeat("a", 59)} {
		if _, err := fixtureDSN("postgres://test:private-password@127.0.0.1:5432/test?sslmode=disable", schema); err != nil {
			t.Errorf("rejected valid schema %q: %v", schema, err)
		}
	}
}

func TestFixtureDSNRejectsRemoteHostsAndRoutingOverrides(t *testing.T) {
	for _, raw := range []string{
		"", "host=127.0.0.1 user=test dbname=test", "https://localhost/test",
		"postgres://private-password@production.example/test",
		"postgres://127.0.0.2/test", "postgres:///test", "postgres://localhost.attacker.example/test",
		"postgres://127.0.0.1/test?host=production.example", "postgres://localhost/test?hostaddr=192.0.2.1",
		"postgres://localhost/test?service=production", "postgres://localhost/test?options=-c%20search_path%3Dpublic",
		"postgres://localhost/test?sslmode=disable#private-password",
	} {
		if _, err := fixtureDSN(raw, "e2e_test"); err == nil {
			t.Errorf("accepted unsafe connection URL %q", raw)
		} else if strings.Contains(err.Error(), "private-password") || strings.Contains(err.Error(), "production.example") {
			t.Errorf("validation error exposed connection details: %v", err)
		}
	}
}

func TestFixtureDSNOverridesSearchPathAndConnectionDeadline(t *testing.T) {
	for _, host := range []string{"127.0.0.1:5432", "localhost:5432", "[::1]:5432"} {
		raw := "postgresql://test:private-password@" + host + "/test?sslmode=disable&search_path=public&connect_timeout=999"
		scoped, err := fixtureDSN(raw, "e2e_session_123")
		if err != nil {
			t.Fatal(err)
		}
		parsed, err := url.Parse(scoped)
		if err != nil || parsed.Query().Get("search_path") != "e2e_session_123" || parsed.Query().Get("connect_timeout") != "10" || parsed.Host != host || parsed.Query().Get("sslmode") != "disable" {
			t.Fatalf("scoped URL did not preserve safe connection settings or enforce isolation")
		}
	}
}

func TestFixtureRunRejectsInvalidCommandsBeforeConnection(t *testing.T) {
	for _, args := range [][]string{{}, {"create"}, {"destroy", "e2e_test"}, {"drop", "public"}, {"create", "e2e_test", "extra"}} {
		var stdout bytes.Buffer
		err := run(args, "postgres://private-password@production.example/test", &stdout)
		if err == nil || stdout.Len() != 0 || strings.Contains(err.Error(), "private-password") || strings.Contains(err.Error(), "production.example") {
			t.Fatalf("invalid commands must fail privately before connecting: args %v err %v", args, err)
		}
	}
}
