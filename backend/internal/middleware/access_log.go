package middleware

import (
	"fmt"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/utils"
)

func AccessLogger(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		c.Next()

		// Don't log admin access logs requests to avoid infinite loop
		if path == "/api/v1/admin/access-logs" || path == "/api/v1/admin/access-logs/stats" {
			return
		}

		elapsed := time.Since(start)
		ua := c.GetHeader("User-Agent")
		browser, osName, device := utils.ParseUserAgent(ua)

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
			IPAddress:    c.ClientIP(),
			UserAgent:    ua,
			Method:       c.Request.Method,
			Path:         path,
			QueryParams:  query,
			StatusCode:   c.Writer.Status(),
			ResponseTime: int(elapsed.Milliseconds()),
			Referer:      c.GetHeader("Referer"),
			DeviceType:   device,
			Browser:      browser,
			OS:           osName,
			UserID:       userID,
			SessionID:    sid,
		}

		if err := db.Create(&log).Error; err != nil {
			fmt.Fprintf(os.Stderr, "access log write error: %v\n", err)
		}
	}
}
