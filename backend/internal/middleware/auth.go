package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"tano_blog/backend/internal/config"
)

func AuthRequired(cfg *config.JWTConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := GetToken(c)
		if tokenStr == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
			return
		}
		claims := &jwtClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(cfg.Secret), nil
		})
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "登录已过期，请重新登录"})
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Next()
	}
}

type jwtClaims struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// OptionalAuth sets user info if token is present, but doesn't reject
func OptionalAuth(cfg *config.JWTConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := GetToken(c)
		if tokenStr == "" {
			c.Next()
			return
		}
		claims := &jwtClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(cfg.Secret), nil
		})
		if err == nil && token.Valid {
			c.Set("user_id", claims.UserID)
			c.Set("username", claims.Username)
		}
		c.Next()
	}
}

// PathPrefix checks if the path is a public or admin route
func IsPublicRoute(path string) bool {
	publicPrefixes := []string{"/api/v1/auth/login", "/api/v1/auth/passkey/login", "/api/v1/posts", "/api/v1/categories", "/api/v1/tags"}
	for _, p := range publicPrefixes {
		if strings.HasPrefix(path, p) {
			return true
		}
	}
	return strings.HasPrefix(path, "/uploads/")
}

func IsAdminRoute(path string) bool {
	return strings.HasPrefix(path, "/api/v1/admin/")
}

// RoleRequired checks that the authenticated user has the required role
func RoleRequired(role string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userRole, exists := c.Get("role")
		if !exists || userRole != role {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "权限不足"})
			return
		}
		c.Next()
	}
}
