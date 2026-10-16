package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/middleware"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/testutil"
	"tano_blog/backend/internal/utils"
)

func mustCreatePerformanceFixture(t *testing.T, db *gorm.DB, value interface{}) {
	t.Helper()
	if err := db.Create(value).Error; err != nil {
		t.Fatal(err)
	}
}

func postRenderRouter(db *gorm.DB) *gin.Engine {
	router := gin.New()
	_ = router.SetTrustedProxies(nil)
	router.Use(middleware.RequestBudget(3*time.Second, 3*time.Second))
	router.Use(middleware.IPBan(repository.NewIPBanRepo(db)))
	handler := NewPostHandler(repository.NewPostRepo(db), "render-test-secret")
	optionalAuth := middleware.OptionalAuth(&config.JWTConfig{Secret: "render-test-secret"}, db)
	router.GET("/api/v1/posts/:slug", optionalAuth, handler.GetBySlug)
	// Like the public production route, this accepts a first visitor without a
	// CSRF cookie. Authentication is optional and still checked for private posts.
	router.POST("/api/v1/posts/:slug/view", optionalAuth, handler.RecordView)
	return router
}

func servePostRequest(router *gin.Engine, method, slug, ip string, render bool, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	path := "/api/v1/posts/" + slug
	if method == http.MethodPost {
		path += "/view"
	}
	req := httptest.NewRequest(method, path, nil)
	req.RemoteAddr = ip + ":12345"
	if render {
		req.Header.Set("X-Render-Request", "1")
	}
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func assertPostViews(t *testing.T, db *gorm.DB, id uuid.UUID, expected int64) {
	t.Helper()
	var count int64
	if err := db.Model(&model.Post{}).Select("view_count").Where("id = ?", id).Scan(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != expected {
		t.Fatalf("view count = %d, want %d", count, expected)
	}
}

func TestRenderedArticleCountsOnlyBrowserVisitAndUsesVisitorReactions(t *testing.T) {
	db := testutil.Database(t, &model.Post{}, &model.PostSeries{}, &model.PostReaction{}, &model.IPBan{})
	post := model.Post{Title: "article", Slug: "article", Content: "published body", Status: "published", PreviewToken: uuid.NewString()}
	mustCreatePerformanceFixture(t, db, &post)
	mustCreatePerformanceFixture(t, db, &[]model.PostReaction{
		{PostID: post.ID, Emoji: "👍", IPAddress: "203.0.113.10"},
		{PostID: post.ID, Emoji: "👍", IPAddress: "203.0.113.11"},
		{PostID: post.ID, Emoji: "❤️", IPAddress: "127.0.0.1"},
	})
	router := postRenderRouter(db)
	for range 2 { // Rendering and metadata may each read without adding a visit.
		rec := servePostRequest(router, http.MethodGet, post.Slug, "127.0.0.1", true)
		var body map[string]json.RawMessage
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if rec.Code != http.StatusOK || body["reactions"] != nil || body["user_emojis"] != nil {
			t.Fatalf("render leaked server reactions: %d %s", rec.Code, rec.Body)
		}
		assertPostViews(t, db, post.ID, 0)
	}
	for i, method := range []string{http.MethodPost, http.MethodGet} {
		rec := servePostRequest(router, method, post.Slug, "203.0.113.10", false)
		var body struct {
			Reactions  map[string]int `json:"reactions"`
			UserEmojis []string       `json:"user_emojis"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if rec.Code != http.StatusOK || body.Reactions["👍"] != 2 || body.Reactions["❤️"] != 1 || len(body.UserEmojis) != 1 || body.UserEmojis[0] != "👍" {
			t.Fatalf("browser visit lost visitor reactions: %d %s", rec.Code, rec.Body)
		}
		assertPostViews(t, db, post.ID, int64(i+1))
	}
}

func TestPostRenderingAndViewRecordingPreserveResourceAccess(t *testing.T) {
	db := testutil.Database(t, &model.Post{}, &model.PostSeries{}, &model.PostReaction{}, &model.IPBan{})
	protected := model.Post{Title: "protected", Slug: "protected", Content: "private body", Status: "published", PasswordHash: "password-present", PreviewToken: uuid.NewString()}
	draft := model.Post{Title: "draft", Slug: "draft", Content: "draft body", Status: "draft", PreviewToken: uuid.NewString()}
	admin := model.User{Username: "admin", Email: "admin@example.test", Role: "admin", PasswordHash: "unused"}
	mustCreatePerformanceFixture(t, db, &protected)
	mustCreatePerformanceFixture(t, db, &draft)
	mustCreatePerformanceFixture(t, db, &admin)
	access, err := utils.GenerateResourceToken(utils.ResourcePost, protected.ID.String(), "render-test-secret", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	adminToken, err := utils.GenerateJWTWithVersion(admin.ID, admin.Username, admin.Role, "render-test-secret", time.Hour, admin.TokenVersion)
	if err != nil {
		t.Fatal(err)
	}
	router := postRenderRouter(db)
	locked := servePostRequest(router, http.MethodGet, protected.Slug, "203.0.113.10", true)
	var lockedBody struct {
		Post map[string]interface{} `json:"post"`
	}
	if err := json.Unmarshal(locked.Body.Bytes(), &lockedBody); err != nil {
		t.Fatal(err)
	}
	if locked.Code != http.StatusOK || lockedBody.Post["password_protected"] != true || lockedBody.Post["content"] != nil {
		t.Fatalf("locked render exposed content: %s", locked.Body)
	}
	for _, tc := range []struct {
		name, slug string
		cookies    []*http.Cookie
		status     int
	}{
		{"locked", protected.Slug, nil, http.StatusForbidden},
		{"forged access", protected.Slug, []*http.Cookie{{Name: "post_access_" + protected.ID.String(), Value: "forged"}}, http.StatusForbidden},
		{"unlocked", protected.Slug, []*http.Cookie{{Name: "post_access_" + protected.ID.String(), Value: access}}, http.StatusOK},
		{"anonymous draft", draft.Slug, nil, http.StatusNotFound},
		{"stale admin", draft.Slug, []*http.Cookie{{Name: "jwt", Value: "expired"}}, http.StatusNotFound},
		{"admin draft", draft.Slug, []*http.Cookie{{Name: "jwt", Value: adminToken}}, http.StatusOK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := servePostRequest(router, http.MethodPost, tc.slug, "203.0.113.10", false, tc.cookies...)
			if rec.Code != tc.status {
				t.Fatalf("status %d, want %d: %s", rec.Code, tc.status, rec.Body)
			}
		})
	}
	assertPostViews(t, db, protected.ID, 1)
	assertPostViews(t, db, draft.ID, 1)
}

func TestActiveBanDefersSSRAndBrowserCannotBypassPostBan(t *testing.T) {
	db := testutil.Database(t, &model.Post{}, &model.PostSeries{}, &model.PostReaction{}, &model.IPBan{})
	post := model.Post{Title: "article", Slug: "article", Content: "body", Status: "published", PreviewToken: uuid.NewString()}
	mustCreatePerformanceFixture(t, db, &post)
	mustCreatePerformanceFixture(t, db, &model.IPBan{IPAddress: "203.0.113.10", Scope: "post"})
	router := postRenderRouter(db)
	for _, tc := range []struct {
		method, ip string
		render     bool
		status     int
	}{
		{http.MethodGet, "127.0.0.1", true, http.StatusConflict},
		{http.MethodPost, "203.0.113.10", false, http.StatusForbidden},
		{http.MethodGet, "203.0.113.10", false, http.StatusForbidden},
		{http.MethodGet, "203.0.113.10", true, http.StatusConflict},
		{http.MethodGet, "203.0.113.11", false, http.StatusOK},
	} {
		rec := servePostRequest(router, tc.method, post.Slug, tc.ip, tc.render)
		if rec.Code != tc.status {
			t.Fatalf("%s %s render=%v: %d %s", tc.method, tc.ip, tc.render, rec.Code, rec.Body)
		}
	}
	assertPostViews(t, db, post.ID, 1)
}
