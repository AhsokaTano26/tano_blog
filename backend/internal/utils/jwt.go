package utils

import (
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
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}
	return nil, jwt.ErrSignatureInvalid
}
