package middleware

import (
	"net/url"
	"testing"
)

func TestRedactSensitiveQuery(t *testing.T) {
	got := redactSensitiveQuery("page=2&token=secret&preview_token=preview&search=hello")
	values, err := url.ParseQuery(got)
	if err != nil {
		t.Fatal(err)
	}
	if values.Get("page") != "2" || values.Get("search") != "hello" {
		t.Fatalf("non-sensitive values changed: %q", got)
	}
	if values.Get("token") != "[REDACTED]" || values.Get("preview_token") != "[REDACTED]" {
		t.Fatalf("sensitive values were not redacted: %q", got)
	}
}

func TestMalformedQueryIsNotLogged(t *testing.T) {
	if got := redactSensitiveQuery("%zz"); got != "" {
		t.Fatalf("malformed query should be dropped, got %q", got)
	}
}

func TestSensitiveRefererQueryIsRedacted(t *testing.T) {
	got := redactSensitiveURL("https://example.test/admin/reset-password?token=secret&from=email")
	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Query().Get("token") != "[REDACTED]" {
		t.Fatalf("referer token was not redacted: %q", got)
	}
	if parsed.Query().Get("from") != "email" {
		t.Fatalf("safe referer query changed: %q", got)
	}
}
