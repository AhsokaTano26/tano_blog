package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"tano_blog/backend/internal/repository"
)

// StandbyReadOnly prevents split-brain writes. Sync configuration remains
// writable so an administrator can promote a standby deliberately.
func StandbyReadOnly(configRepo *repository.SiteConfigRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		switch c.Request.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			c.Next()
			return
		}

		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/api/v1/auth/") || strings.HasPrefix(path, "/api/v1/admin/config") || strings.HasPrefix(path, "/api/v1/admin/sync") {
			c.Next()
			return
		}
		role, err := configRepo.Get("sync_role")
		enabled, enabledErr := configRepo.Get("sync_enabled")
		if err == nil && enabledErr == nil && enabled == "true" && role == "standby" {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "备服务器为只读模式，请在主服务器执行编辑操作"})
			return
		}
		c.Next()
	}
}
