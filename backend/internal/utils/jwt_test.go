package utils

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
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

func TestBoundResourceTokenRevokesChangedCredentialWithoutDisclosingIt(t *testing.T) {
	const secret = "resource-signing-secret"
	const credential = "$2a$10$current-bcrypt-hash"
	token, err := GenerateBoundResourceToken(ResourcePost, "post-1", credential, secret, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyBoundResourceToken(token, ResourcePost, "post-1", credential, secret) {
		t.Fatal("current resource credential was rejected")
	}
	for _, tc := range []struct{ resourceType, resourceID, credential, secret string }{
		{ResourcePost, "post-1", "$2a$10$new-bcrypt-hash", secret},
		{ResourcePost, "post-2", credential, secret},
		{ResourceMusic, "post-1", credential, secret},
		{ResourcePost, "post-1", credential, "another-signing-secret"},
		{ResourcePost, "post-1", "", secret},
	} {
		if VerifyBoundResourceToken(token, tc.resourceType, tc.resourceID, tc.credential, tc.secret) {
			t.Error("credential accepted outside its current resource, password, or key")
		}
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatal("generated token is malformed")
	}
	claims, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(claims), credential) || strings.Contains(string(claims), "credential") || strings.Contains(string(claims), "password") {
		t.Fatal("resource claims disclosed credential state")
	}
	legacy, err := GenerateResourceToken(ResourcePost, "post-1", secret, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if VerifyBoundResourceToken(legacy, ResourcePost, "post-1", credential, secret) {
		t.Error("legacy resource token was accepted")
	}
	if _, err := GenerateBoundResourceToken(ResourcePost, "post-1", "", secret, time.Hour); err == nil {
		t.Error("generated a bound token with no credential")
	}
}

func TestBoundResourceTokenRejectsExpiredMissingExpiryAndOtherAlgorithm(t *testing.T) {
	const secret, credential = "resource-secret", "resource-password"
	for _, tc := range []struct {
		name   string
		method jwt.SigningMethod
		expiry *jwt.NumericDate
	}{
		{"expired", jwt.SigningMethodHS256, jwt.NewNumericDate(time.Now().Add(-time.Minute))},
		{"missing expiry", jwt.SigningMethodHS256, nil},
		{"other algorithm", jwt.SigningMethodHS512, jwt.NewNumericDate(time.Now().Add(time.Hour))},
	} {
		t.Run(tc.name, func(t *testing.T) {
			claims := ResourceClaims{ResourceType: ResourceMusic, ResourceID: "library", RegisteredClaims: jwt.RegisteredClaims{Issuer: resourceTokenIssuer, ExpiresAt: tc.expiry}}
			token, err := jwt.NewWithClaims(tc.method, claims).SignedString([]byte(resourceCredentialKey(ResourceMusic, "library", credential, secret)))
			if err != nil {
				t.Fatal(err)
			}
			if VerifyBoundResourceToken(token, ResourceMusic, "library", credential, secret) {
				t.Error("invalid bound resource token was accepted")
			}
		})
	}
}
