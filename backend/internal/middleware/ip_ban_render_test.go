package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/testutil"
)

func TestRenderFallbackIgnoresExpiredBansButChecksAllActiveScopes(t *testing.T) {
	db := testutil.Database(t, &model.IPBan{})
	expired := time.Now().Add(-time.Minute)
	ban := model.IPBan{IPAddress: "203.0.113.50", Scope: "comment", ExpiresAt: &expired}
	if err := db.Create(&ban).Error; err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	_ = router.SetTrustedProxies(nil)
	router.Use(IPBan(repository.NewIPBanRepo(db)))
	router.GET("/api/v1/posts/article", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	request := func(render, cancelled bool) int {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/posts/article", nil)
		req.RemoteAddr = "127.0.0.1:12345"
		if render {
			req.Header.Set("X-Render-Request", "1")
		}
		if cancelled {
			ctx, cancel := context.WithCancel(req.Context())
			cancel()
			req = req.WithContext(ctx)
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec.Code
	}
	if status := request(true, false); status != http.StatusNoContent {
		t.Fatalf("expired ban blocked rendering: %d", status)
	}
	if err := db.Model(&ban).Update("expires_at", nil).Error; err != nil {
		t.Fatal(err)
	}
	if status := request(true, false); status != http.StatusConflict {
		t.Fatalf("active ban did not defer rendering: %d", status)
	}
	if status := request(false, false); status != http.StatusNoContent {
		t.Fatalf("unbanned browser was blocked: %d", status)
	}
	if err := db.Delete(&ban).Error; err != nil {
		t.Fatal(err)
	}
	if status := request(true, true); status != http.StatusConflict {
		t.Fatalf("failed ban query allowed rendering: %d", status)
	}
}
