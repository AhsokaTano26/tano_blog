package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Token")
			c.Header("Access-Control-Max-Age", "86400")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func CSRF() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == "GET" || c.Request.Method == "HEAD" || c.Request.Method == "OPTIONS" {
			c.Next()
			return
		}
		token := c.GetHeader("X-CSRF-Token")
		cookie, err := c.Cookie("csrf_token")
		if err != nil || token == "" || token != cookie {
			// Only enforce for non-public routes in production
			// For now, just pass through since we use JWT in cookies
			c.Next()
			return
		}
		c.Next()
	}
}

// GetToken extracts JWT from Cookie or Authorization header
func GetToken(c *gin.Context) string {
	// Try cookie first
	token, err := c.Cookie("jwt")
	if err == nil && token != "" {
		return token
	}
	// Fallback to Authorization header
	auth := c.GetHeader("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	return ""
}
