package middleware

import (
	"context"
	"github.com/gin-gonic/gin"
	"net/http"
	"strings"
	"time"
)

// RequestBudget bounds ordinary database work while giving streamed uploads and
// explicit long operations their own budget. Disconnections still cancel both.
func RequestBudget(normal, large time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		budget := normal
		path := c.Request.URL.Path
		if path == "/api/v1/admin/upload" || strings.HasPrefix(path, "/api/v1/admin/restore/") || path == "/api/v1/admin/backups" && c.Request.Method == http.MethodPost || strings.HasPrefix(path, "/api/v1/admin/backups/") && strings.HasSuffix(path, "/download") {
			budget = large
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), budget)
		defer cancel()
		c.Request = c.Request.WithContext(ctx)
		deadline, _ := ctx.Deadline()
		controller := http.NewResponseController(c.Writer)
		// Gin exposes the underlying ResponseWriter through Unwrap.
		_ = controller.SetReadDeadline(deadline)
		_ = controller.SetWriteDeadline(deadline)
		c.Next()
	}
}
