package utils

import (
	"testing"
	"time"
)

func TestResourceTokenIsBoundToResourceAndType(t *testing.T) {
	const secret = "test-secret-that-is-long-enough"
	token, err := GenerateResourceToken(ResourcePost, "post-1", secret, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyResourceToken(token, ResourcePost, "post-1", secret) {
		t.Fatal("valid resource token was rejected")
	}
	if VerifyResourceToken(token, ResourcePost, "post-2", secret) {
		t.Fatal("token was accepted for another post")
	}
	if VerifyResourceToken(token, ResourceMusic, "post-1", secret) {
		t.Fatal("token was accepted for another resource type")
	}
	if VerifyResourceToken(token, ResourcePost, "post-1", "different-secret") {
		t.Fatal("token was accepted with another signing key")
	}
}

func TestExpiredResourceTokenIsRejected(t *testing.T) {
	token, err := GenerateResourceToken(ResourceMusic, "library", "secret", -time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if VerifyResourceToken(token, ResourceMusic, "library", "secret") {
		t.Fatal("expired token was accepted")
	}
}
