package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"tano_blog/backend/internal/repository"
)

// StandbyReadOnly prevents split-brain writes. Sync configuration remains
// writable so an administrator can promote a standby deliberately.
func StandbyReadOnly(configRepo *repository.SiteConfigRepo, acquireWriteLease func() func(), acquireWithContext ...func(context.Context) (func(), error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		switch c.Request.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			c.Next()
			return
		}

		path := c.Request.URL.Path
		if path == "/api/v1/admin/backup/cancel" || strings.HasPrefix(path, "/api/v1/admin/sync") {
			c.Next()
			return
		}
		allowOnStandby := path == "/api/v1/auth/login" || path == "/api/v1/auth/login/totp" ||
			path == "/api/v1/auth/passkey/login/options" || path == "/api/v1/auth/passkey/login/verify" || path == "/api/v1/admin/config"

		// Restore and backup acquire their own exclusive cancellable gate.
		exclusive := c.Request.Method == http.MethodPost && (path == "/api/v1/admin/backups" || path == "/api/v1/admin/restore/upload" || path == "/api/v1/admin/restore/url" || path == "/api/v1/admin/restore/local")
		if !exclusive {
			if len(acquireWithContext) > 0 && acquireWithContext[0] != nil {
				release, err := acquireWithContext[0](c.Request.Context())
				if err != nil {
					c.AbortWithStatusJSON(http.StatusRequestTimeout, gin.H{"error": "请求已取消"})
					return
				}
				defer release()
			} else if acquireWriteLease != nil {
				defer acquireWriteLease()()
			}
		}
		// Login and promotion remain available on a standby, but their writes must
		// also wait for a restore so local settings/sessions are not lost mid-commit.
		if allowOnStandby {
			c.Next()
			return
		}
		// Re-read the role only after waiting: a restore/promotion may have changed it.
		settings, err := configRepo.WithContext(c.Request.Context()).GetByKeys([]string{"sync_enabled", "sync_role"})
		if err != nil {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "无法确认服务器同步角色，暂时禁止写入"})
			return
		}
		values := make(map[string]string, len(settings))
		for _, setting := range settings {
			values[setting.Key] = setting.Value
		}
		if values["sync_enabled"] == "true" && values["sync_role"] == "standby" {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "备服务器为只读模式，请在主服务器执行编辑操作"})
			return
		}
		c.Next()
	}
}
