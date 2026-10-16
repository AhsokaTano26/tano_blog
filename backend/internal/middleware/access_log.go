package middleware

import (
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"tano_blog/backend/internal/model"
)

func AccessLogger(writer *AccessLogWriter) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := redactSensitiveQuery(c.Request.URL.RawQuery)

		c.Next()

		// Don't log admin access logs requests to avoid infinite loop
		if path == "/health" || strings.HasPrefix(path, "/uploads/") || strings.HasPrefix(path, "/api/v1/admin/access-logs") || path == "/api/v1/admin/metrics" || path == "/api/v1/admin/backup/status" {
			return
		}

		elapsed := time.Since(start)
		ua := c.GetHeader("User-Agent")

		var userID *uuid.UUID
		if uid, exists := c.Get("user_id"); exists {
			if parsed, err := uuid.Parse(uid.(string)); err == nil {
				userID = &parsed
			}
		}

		sid := ""
		if s, err := c.Cookie("session_id"); err == nil {
			sid = s
		}

		log := model.AccessLog{
			CreatedAt:    start,
			IPAddress:    c.ClientIP(),
			UserAgent:    ua,
			Method:       c.Request.Method,
			Path:         path,
			QueryParams:  query,
			StatusCode:   c.Writer.Status(),
			ResponseTime: int(elapsed.Milliseconds()),
			Referer:      redactSensitiveURL(c.GetHeader("Referer")),
			UserID:       userID,
			SessionID:    sid,
		}

		writer.Enqueue(log)
	}
}

func redactSensitiveQuery(raw string) string {
	if raw == "" {
		return ""
	}
	values, err := url.ParseQuery(raw)
	if err != nil {
		return ""
	}
	for key := range values {
		switch strings.ToLower(key) {
		case "token", "access_token", "reset_token", "preview_token", "code", "password":
			values.Set(key, "[REDACTED]")
		}
	}
	return values.Encode()
}

func redactSensitiveURL(raw string) string {
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	parsed.RawQuery = redactSensitiveQuery(parsed.RawQuery)
	return parsed.String()
}
