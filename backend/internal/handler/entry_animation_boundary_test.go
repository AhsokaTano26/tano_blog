package handler

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/entryanimation"
	"tano_blog/backend/internal/middleware"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
	"tano_blog/backend/internal/utils"
)

func TestEntryAnimationSavedContentBoundary(t *testing.T) {
	db := testutil.Database(t, &model.SiteConfig{}, &model.User{})
	user := model.User{Username: "private-entry-admin", Email: "boundary@example.test", Role: "admin",
		PasswordHash: "fixture", TokenVersion: 4, SessionEpoch: "current-entry-epoch"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	cfg := &config.JWTConfig{Secret: "private-entry-boundary-test-secret"}
	token := func(role, secret, epoch string, version int, duration time.Duration) string {
		t.Helper()
		value, err := utils.GenerateJWTWithSession(user.ID, user.Username, role, secret, duration, version, epoch)
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	valid := token("admin", cfg.Secret, user.SessionEpoch, user.TokenVersion, time.Hour)
	r := gin.New()
	r.Use(PrivateEntryAnimationCache)
	configs := NewSiteConfigHandler(db, nil, cfg.Secret, "")
	r.GET("/api/v1/config/public", configs.GetPublic)
	r.GET("/api/v1/config/about", configs.GetPublic)
	r.GET("/api/v1/config/music", configs.GetMusic)
	auth := r.Group("/api/v1", middleware.AuthRequired(cfg, db), middleware.CSRF(), middleware.PasswordChangeRequired())
	auth.POST("/auth/logout", NewAuthHandler(db, cfg, nil).Logout)
	admin := auth.Group("/admin", middleware.RoleRequired("admin"))
	NewEntryAnimationHandler(db).Register(admin)
	admin.GET("/config", configs.Get)

	const canary = "PRIVATE-ENTRY-SAVED-BOUNDARY-CANARY"
	var imageData bytes.Buffer
	if err := png.Encode(&imageData, image.NewRGBA(image.Rect(0, 0, 7, 11))); err != nil {
		t.Fatal(err)
	}
	icon := "data:image/png;base64," + base64.StdEncoding.EncodeToString(imageData.Bytes())
	body, err := json.Marshal(entryanimation.Config{
		Overrides: map[string]string{"opening_title": canary, "welcome_title": canary}, IconDataURL: icon,
	})
	if err != nil {
		t.Fatal(err)
	}
	call := func(method, path, credential, transport string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(&http.Cookie{Name: "csrf_token", Value: "boundary-csrf"})
		req.Header.Set("X-CSRF-Token", "boundary-csrf")
		if credential != "" {
			if transport == "cookie" {
				req.AddCookie(&http.Cookie{Name: "jwt", Value: credential})
			} else {
				req.Header.Set("Authorization", "Bearer "+credential)
			}
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	noPrivateContent := func(t *testing.T, w *httptest.ResponseRecorder) {
		t.Helper()
		for _, value := range []string{canary, icon, entryanimation.ConfigKey, "TANO ARCHIVE"} {
			if strings.Contains(w.Body.String(), value) {
				t.Fatal("private animation content escaped into a denied/public response")
			}
		}
	}
	privateRoutes := []struct{ method, suffix string }{
		{"GET", ""}, {"GET", "/player"}, {"PUT", ""}, {"POST", "/preview"},
	}
	checkDenied := func(t *testing.T, credential string, status int) {
		t.Helper()
		for _, transport := range []string{"cookie", "header"} {
			for _, route := range privateRoutes {
				w := call(route.method, "/api/v1/admin/entry-animation"+route.suffix, credential, transport)
				if w.Code != status {
					t.Fatalf("%s %s %s: got %d, want %d", transport, route.method, route.suffix, w.Code, status)
				}
				if w.Header().Get("Cache-Control") != "private, no-store" ||
					!strings.Contains(w.Header().Get("Vary"), "Cookie, Authorization") {
					t.Fatal("private response lost its cache isolation")
				}
				noPrivateContent(t, w)
			}
		}
	}
	if w := call("PUT", "/api/v1/admin/entry-animation", valid, "cookie"); w.Code != 200 {
		t.Fatalf("save fixture: %d", w.Code)
	}
	// Warm every private response before testing that other callers cannot read it.
	for _, route := range privateRoutes {
		w := call(route.method, "/api/v1/admin/entry-animation"+route.suffix, valid, "cookie")
		if w.Code != 200 || !strings.Contains(w.Body.String(), canary) || !strings.Contains(w.Body.String(), icon) {
			t.Fatalf("authenticated fixture unavailable at %s %s: %d", route.method, route.suffix, w.Code)
		}
		if w.Header().Get("Cache-Control") != "private, no-store" {
			t.Fatal("authenticated animation response is cacheable")
		}
	}
	for _, tc := range []struct{ name, credential string }{
		{"anonymous", ""},
		{"invalid", "invalid"},
		{"expired", token("admin", cfg.Secret, user.SessionEpoch, 4, -time.Minute)},
		{"wrong_signature", token("admin", "different-secret", user.SessionEpoch, 4, time.Hour)},
		{"pending_second_factor", token("totp_pending", cfg.Secret, user.SessionEpoch, 4, time.Hour)},
		{"password_reset", token("reset", cfg.Secret, user.SessionEpoch, 4, time.Hour)},
		{"revoked_version", token("admin", cfg.Secret, user.SessionEpoch, 3, time.Hour)},
		{"restored_epoch", token("admin", cfg.Secret, "previous-epoch", 4, time.Hour)},
	} {
		t.Run(tc.name, func(t *testing.T) { checkDenied(t, tc.credential, http.StatusUnauthorized) })
	}
	t.Run("public_config_after_authenticated_reads", func(t *testing.T) {
		for _, credential := range []string{"", valid} {
			for _, path := range []string{"/api/v1/config/public", "/api/v1/config/about", "/api/v1/config/music",
				"/api/v1/config/public?key=admin_entry_animation"} {
				w := call("GET", path, credential, "cookie")
				if w.Code != 200 {
					t.Fatalf("public config status: %d", w.Code)
				}
				noPrivateContent(t, w)
			}
		}
		noPrivateContent(t, call("GET", "/api/v1/admin/config", valid, "cookie"))
	})
	t.Run("current_database_permissions_override_token", func(t *testing.T) {
		for _, changes := range []map[string]any{{"role": "user"}, {"role": "admin", "must_change_password": true}} {
			if err := db.Model(&user).Updates(changes).Error; err != nil {
				t.Fatal(err)
			}
			checkDenied(t, valid, http.StatusForbidden)
		}
		if err := db.Model(&user).Updates(map[string]any{"role": "admin", "must_change_password": false}).Error; err != nil {
			t.Fatal(err)
		}
	})
	t.Run("database_lookup_failure_denies_read", func(t *testing.T) {
		const callback = "test_entry_auth_lookup_failure"
		if err := db.Callback().Query().Before("gorm:query").Register(callback, func(tx *gorm.DB) {
			if tx.Statement.Table == "users" {
				tx.AddError(errors.New("injected session lookup failure"))
			}
		}); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { db.Callback().Query().Remove(callback) })
		checkDenied(t, valid, http.StatusUnauthorized)
	})
	t.Run("logout_must_confirm_revocation_before_reporting_success", func(t *testing.T) {
		const callback = "test_entry_logout_write_failure"
		if err := db.Callback().Update().Before("gorm:update").Register(callback, func(tx *gorm.DB) {
			if tx.Statement.Table == "users" {
				tx.AddError(errors.New("injected revocation failure"))
			}
		}); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { db.Callback().Update().Remove(callback) })
		w := call("POST", "/api/v1/auth/logout", valid, "cookie")
		if w.Code < 500 || w.Code >= 600 {
			t.Errorf("logout claimed success without revocation: %d", w.Code)
		}
		for _, cookie := range w.Result().Cookies() {
			if cookie.Name == "jwt" && cookie.MaxAge < 0 {
				t.Error("failed logout discarded the cookie before revoking the server session")
			}
		}
	})
	t.Run("successful_logout_rejects_copied_cookie_and_bearer", func(t *testing.T) {
		if w := call("POST", "/api/v1/auth/logout", valid, "cookie"); w.Code != 200 {
			t.Fatalf("logout status: %d", w.Code)
		}
		checkDenied(t, valid, http.StatusUnauthorized)
	})
}
