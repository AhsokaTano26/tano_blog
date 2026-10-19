package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	"tano_blog/backend/internal/monitoring"
)

// RequestMetrics must precede gin.Recovery so it observes the final 500 status
// of recovered panics. FullPath is a registered template; URL.Path is never read.
func RequestMetrics(recorder *monitoring.Recorder) gin.HandlerFunc {
	return func(c *gin.Context) {
		started := time.Now()
		c.Next()
		recorder.Observe(c.Request.Method, c.FullPath(), c.Writer.Status(), time.Since(started), time.Now())
	}
}
