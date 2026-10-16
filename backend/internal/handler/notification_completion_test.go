package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
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

// A notification insert is deliberately held open. Returning the response before
// releasing it would cancel its request context and lose the notification.
func TestNotificationsFinishBeforeRequestContextIsCancelled(t *testing.T) {
	password, err := utils.HashPassword("notification-test-password")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name   string
		status int
		kinds  []string
	}{
		{"comment", http.StatusCreated, []string{"new_comment"}},
		{"reply", http.StatusCreated, []string{"new_comment", "reply"}},
		{"friend link", http.StatusCreated, []string{"link_apply"}},
		{"login", http.StatusOK, []string{"login"}},
		{"password reset", http.StatusOK, []string{"password_reset"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := testutil.Database(t, &model.Post{}, &model.PostSeries{}, &model.Comment{}, &model.Notification{}, &model.FriendLink{}, &model.SiteConfig{})
			admin := model.User{Username: "notification-admin", Email: "admin@example.test", Role: "admin", PasswordHash: password}
			mustCreatePerformanceFixture(t, db, &admin)
			post := model.Post{Title: "article", Slug: "article", Content: "body", Status: "published", AllowComment: true, PreviewToken: uuid.NewString()}
			mustCreatePerformanceFixture(t, db, &post)
			parent := model.Comment{PostID: post.ID, Nickname: "parent", Email: "parent@example.test", Content: "parent comment", Status: "approved"}
			mustCreatePerformanceFixture(t, db, &parent)

			entered := make(chan struct{}, 1)
			release := make(chan struct{})
			var releaseOnce sync.Once
			unblock := func() { releaseOnce.Do(func() { close(release) }) }
			defer unblock()
			if err := db.Callback().Create().Before("gorm:create").Register("test_wait_for_notification", func(tx *gorm.DB) {
				if tx.Statement.Table != "notifications" {
					return
				}
				select {
				case entered <- struct{}{}:
				default:
				}
				select {
				case <-release:
				case <-tx.Statement.Context.Done():
					tx.AddError(tx.Statement.Context.Err())
				}
			}); err != nil {
				t.Fatal(err)
			}

			router := gin.New()
			_ = router.SetTrustedProxies(nil)
			router.Use(middleware.RequestBudget(3*time.Second, 3*time.Second))
			var requestContext context.Context
			router.Use(func(c *gin.Context) { requestContext = c.Request.Context(); c.Next() })
			auth := NewAuthHandler(db, &config.JWTConfig{Secret: "notification-secret", Expiration: time.Hour}, nil)
			comments := NewCommentHandler(repository.NewCommentRepo(db), db, nil, "notification-secret")
			path := "/action"
			payload := map[string]string{}
			switch tc.name {
			case "comment", "reply":
				path = "/posts/article/comments"
				router.POST("/posts/:slug/comments", comments.Create)
				payload = map[string]string{"nickname": "reader", "content": "hello"}
				if tc.name == "reply" {
					payload["parent_id"] = parent.ID.String()
				}
			case "friend link":
				router.POST(path, NewFriendLinkHandler(db).Apply)
				payload = map[string]string{"name": "friend", "url": "https://example.test"}
			case "login":
				router.POST(path, auth.Login)
				payload = map[string]string{"username": admin.Username, "password": "notification-test-password"}
			case "password reset":
				router.POST(path, auth.ForgotPassword)
				payload = map[string]string{"email": admin.Email}
			}
			body, err := json.Marshal(payload)
			if err != nil {
				t.Fatal(err)
			}
			req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(string(body)))
			req.Header.Set("Content-Type", "application/json")
			req.RemoteAddr = "203.0.113.20:12345"
			rec := httptest.NewRecorder()
			done := make(chan struct{})
			go func() { defer close(done); router.ServeHTTP(rec, req) }()
			select {
			case <-entered:
			case <-done:
				t.Fatalf("request returned without attempting notification: %d %s", rec.Code, rec.Body)
			case <-time.After(3 * time.Second):
				t.Fatal("request did not attempt notification")
			}
			select {
			case <-done:
				t.Fatal("response returned while notification was still pending")
			case <-time.After(50 * time.Millisecond):
			}
			unblock()
			select {
			case <-done:
			case <-time.After(3 * time.Second):
				t.Fatal("request did not finish after notification insert")
			}
			if rec.Code != tc.status {
				t.Fatalf("status %d: %s", rec.Code, rec.Body)
			}
			if requestContext.Err() != context.Canceled {
				t.Fatalf("request context survived handler: %v", requestContext.Err())
			}
			var notifications []model.Notification
			if err := db.Order("created_at, id").Find(&notifications).Error; err != nil {
				t.Fatal(err)
			}
			if len(notifications) != len(tc.kinds) {
				t.Fatalf("notifications = %d, want %d", len(notifications), len(tc.kinds))
			}
			for i, kind := range tc.kinds {
				if notifications[i].Type != kind || notifications[i].UserID != admin.ID {
					t.Fatalf("incorrect notification: %+v", notifications[i])
				}
			}
		})
	}
}
