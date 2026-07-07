package middleware

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func CORS(allowedOrigins []string) gin.HandlerFunc {
	originSet := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		originSet[o] = true
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && originSet[origin] {
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

// CSRF implements double-submit cookie pattern.
// Design rationale: The csrf_token cookie is set by the server (not JavaScript),
// and all mutating requests must send X-CSRF-Token matching the cookie value.
// An attacker reading the cookie (e.g. via XSS) could bypass, so server-side CSP
// hardening is essential. This is a defense-in-depth layer; the JWT HttpOnly cookie
// is the primary auth mechanism.
// Safe methods (GET/HEAD/OPTIONS) are exempt.
// On first request, a csrf_token cookie is set.
// All mutating requests must include X-CSRF-Token header matching the cookie.
func CSRF() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Set CSRF cookie if not present
		cookie, err := c.Cookie("csrf_token")
		if err != nil || cookie == "" {
			b := make([]byte, 32)
			rand.Read(b)
			cookie = base64.RawURLEncoding.EncodeToString(b)
			secure := c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https"
			c.SetSameSite(http.SameSiteStrictMode)
			c.SetCookie("csrf_token", cookie, int((24 * time.Hour).Seconds()), "/", "", secure, false)
		}

		// Skip validation for safe methods
		if c.Request.Method == "GET" || c.Request.Method == "HEAD" || c.Request.Method == "OPTIONS" {
			c.Next()
			return
		}

		// Validate CSRF token
		token := c.GetHeader("X-CSRF-Token")
		if token == "" {
			// Also check form value for non-JSON requests
			token = c.PostForm("csrf_token")
		}
		if token == "" || token != cookie {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "CSRF 令牌无效"})
			return
		}

		c.Next()
	}
}

// SecurityHeaders adds common security headers to responses
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'")
		c.Header("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		c.Next()
	}
}

// GetToken extracts JWT from Cookie or Authorization header
func GetToken(c *gin.Context) string {
	token, err := c.Cookie("jwt")
	if err == nil && token != "" {
		return token
	}
	auth := c.GetHeader("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	return ""
}
