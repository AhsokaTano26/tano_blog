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
	jwt.RegisteredClaims
}

func GenerateJWT(userID uuid.UUID, username, role, secret string, expiration time.Duration) (string, error) {
	return GenerateJWTWithVersion(userID, username, role, secret, expiration, 0)
}

func GenerateJWTWithVersion(userID uuid.UUID, username, role, secret string, expiration time.Duration, tokenVersion int) (string, error) {
	claims := Claims{
		UserID:       userID,
		Username:     username,
		Role:         role,
		TokenVersion: tokenVersion,
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
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(*Claims); ok && token.Valid && claims.Issuer == "tano_blog" {
		return claims, nil
	}
	return nil, jwt.ErrSignatureInvalid
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
