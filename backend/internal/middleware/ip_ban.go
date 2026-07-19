package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"tano_blog/backend/internal/repository"
)

func IPBan(ipBanRepo *repository.IPBanRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path

		// Skip public files and health check
		if strings.HasPrefix(path, "/uploads/") || path == "/rss.xml" || path == "/sitemap.xml" || path == "/robots.txt" || path == "/health" {
			c.Next()
			return
		}

		// Skip all admin API paths (protected by RBAC instead)
		if strings.HasPrefix(path, "/api/v1/admin/") {
			c.Next()
			return
		}

		ip := c.ClientIP()
		bans, err := ipBanRepo.FindActiveByIP(ip)
		if err != nil || len(bans) == 0 {
			c.Next()
			return
		}

		// Collect all banned scopes
		bannedScopes := map[string]bool{}
		for _, b := range bans {
			for _, s := range strings.Split(b.Scope, ",") {
				bannedScopes[strings.TrimSpace(s)] = true
			}
		}

		// site scope blocks everything
		if bannedScopes["site"] {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "您的IP已被封禁"})
			return
		}

		// Check if request's module is banned
		module := detectModule(path)
		if module != "" && bannedScopes[module] {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "您的IP已被封禁"})
			return
		}

		c.Next()
	}
}

// detectModule maps request path to a module identifier
func detectModule(path string) string {
	if !strings.HasPrefix(path, "/api/v1/") {
		return ""
	}
	p := strings.TrimPrefix(path, "/api/v1/")

	switch {
	case strings.HasPrefix(p, "posts/"):
		// Comments are under /posts/:slug/comments
		if strings.Contains(p, "/comments") {
			return "comment"
		}
		return "post"
	case strings.HasPrefix(p, "categories/"):
		return "category"
	case strings.HasPrefix(p, "tags/"):
		return "tag"
	case strings.HasPrefix(p, "series/"):
		return "series"
	case strings.HasPrefix(p, "links/"):
		return "link"
	case strings.HasPrefix(p, "gallery"):
		return "gallery"
	case strings.HasPrefix(p, "music"):
		return "music"
	case strings.HasPrefix(p, "search"):
		return "search"
	case strings.HasPrefix(p, "auth/login") || strings.HasPrefix(p, "auth/passkey/login"):
		return "login"
	default:
		return ""
	}
}
