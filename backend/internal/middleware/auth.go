package middleware

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/model"
)

type jwtClaims struct {
	UserID       string `json:"user_id"`
	Username     string `json:"username"`
	Role         string `json:"role"`
	TokenVersion int    `json:"token_version"`
	jwt.RegisteredClaims
}

func AuthRequired(cfg *config.JWTConfig, db *gorm.DB) gin.HandlerFunc {
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

		// Verify token_version matches database (supports JWT invalidation on logout)
		uid, err := uuid.Parse(claims.UserID)
		if err == nil {
			var user model.User
			if db.First(&user, uid).Error != nil {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "用户不存在"})
				return
			}
			if user.TokenVersion != claims.TokenVersion {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "登录已失效，请重新登录"})
				return
			}
		}

		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Next()
	}
}

// OptionalAuth sets user info if token is present, but doesn't reject
func OptionalAuth(cfg *config.JWTConfig, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := GetToken(c)
		if tokenStr == "" {
			c.Next()
			return
		}
		claims := &jwtClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(cfg.Secret), nil
		})
		if err == nil && token.Valid {
			uid, err := uuid.Parse(claims.UserID)
			if err == nil {
				var user model.User
				if db.First(&user, uid).Error == nil && user.TokenVersion == claims.TokenVersion {
					c.Set("user_id", claims.UserID)
					c.Set("username", claims.Username)
					c.Set("role", claims.Role)
				}
			}
		}
		c.Next()
	}
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
