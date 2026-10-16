package utils

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Claims struct {
	UserID       uuid.UUID `json:"user_id"`
	Username     string    `json:"username"`
	Role         string    `json:"role"`
	TokenVersion int       `json:"token_version"`
	Purpose      string    `json:"purpose,omitempty"`
	SessionEpoch string    `json:"session_epoch,omitempty"`
	jwt.RegisteredClaims
}

func GenerateJWT(userID uuid.UUID, username, role, secret string, expiration time.Duration) (string, error) {
	return GenerateJWTWithVersion(userID, username, role, secret, expiration, 0)
}

func GenerateJWTWithVersion(userID uuid.UUID, username, role, secret string, expiration time.Duration, tokenVersion int) (string, error) {
	return GenerateJWTWithSession(userID, username, role, secret, expiration, tokenVersion, "")
}

// GenerateJWTWithSession binds both full sessions and intermediate credentials
// to the account's restore epoch. Intermediate purposes never authorize API use.
func GenerateJWTWithSession(userID uuid.UUID, username, role, secret string, expiration time.Duration, tokenVersion int, sessionEpoch string) (string, error) {
	purpose := "session"
	if role == "totp_pending" || role == "reset" {
		purpose = role
	}
	claims := Claims{
		UserID:       userID,
		Username:     username,
		Role:         role,
		TokenVersion: tokenVersion,
		Purpose:      purpose,
		SessionEpoch: sessionEpoch,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "tano_blog",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func ParseJWT(tokenString, secret string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithExpirationRequired())
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(*Claims); ok && token.Valid && claims.Issuer == "tano_blog" {
		return claims, nil
	}
	return nil, jwt.ErrSignatureInvalid
}

// IsSession allows pre-upgrade sessions, but never credentials issued for a
// password reset or an unfinished second factor. Roles are still resolved from DB.
func (c *Claims) IsSession() bool {
	return (c.Role == "admin" || c.Role == "user") && (c.Purpose == "" || c.Purpose == "session")
}

const (
	resourceTokenIssuer = "tano_blog_resource_access"
	ResourcePost        = "post"
	ResourceMusic       = "music"
)

type ResourceClaims struct {
	ResourceType string `json:"resource_type"`
	ResourceID   string `json:"resource_id"`
	jwt.RegisteredClaims
}

func GenerateResourceToken(resourceType, resourceID, secret string, expiration time.Duration) (string, error) {
	now := time.Now()
	claims := ResourceClaims{
		ResourceType: resourceType,
		ResourceID:   resourceID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(expiration)),
			IssuedAt:  jwt.NewNumericDate(now),
			Issuer:    resourceTokenIssuer,
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

func VerifyResourceToken(tokenString, resourceType, resourceID, secret string) bool {
	if tokenString == "" {
		return false
	}
	claims := &ResourceClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	return err == nil &&
		token.Valid &&
		claims.Issuer == resourceTokenIssuer &&
		claims.ResourceType == resourceType &&
		claims.ResourceID == resourceID
}
