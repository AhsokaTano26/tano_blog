package handler

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/entryanimation"
	"tano_blog/backend/internal/middleware"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
	"tano_blog/backend/internal/utils"
)

func TestEntryAnimationPrivacyAndPersistence(t *testing.T) {
	db := testutil.Database(t, &model.SiteConfig{}, &model.User{})
	user := model.User{Username: "entry-admin", DisplayName: "测试管理员", Email: "entry@example.test", Role: "admin", PasswordHash: "fixture", TokenVersion: 7}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.SiteConfig{Key: "site_title", Value: "站点标题"}).Error; err != nil {
		t.Fatal(err)
	}
	cfg := &config.JWTConfig{Secret: "entry-animation-test-secret"}
	r := gin.New()
	r.Use(PrivateEntryAnimationCache)
	h := NewSiteConfigHandler(db, nil, "", "")
	r.GET("/api/v1/config/public", h.GetPublic)
	r.GET("/api/v1/config/about", h.GetPublic)
	admin := r.Group("/api/v1/admin", middleware.AuthRequired(cfg, db), middleware.CSRF(), middleware.PasswordChangeRequired(), middleware.RoleRequired("admin"))
	NewEntryAnimationHandler(db).Register(admin)
	admin.GET("/config", h.Get)
	token := func(role string, version int, duration time.Duration) string {
		value, err := utils.GenerateJWTWithSession(user.ID, user.Username, role, cfg.Secret, duration, version, user.SessionEpoch)
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	call := func(method, path, auth, body string, csrf bool) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if auth != "" {
			req.Header.Set("Authorization", "Bearer "+auth)
		}
		if csrf {
			req.AddCookie(&http.Cookie{Name: "csrf_token", Value: "fixture"})
			req.Header.Set("X-CSRF-Token", "fixture")
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	for _, auth := range []string{"", "invalid", token("totp_pending", 7, time.Minute), token("admin", 6, time.Minute), token("admin", 7, -time.Minute)} {
		for _, route := range []struct{ method, path string }{{"GET", ""}, {"GET", "/player"}, {"PUT", ""}, {"POST", "/preview"}} {
			w := call(route.method, "/api/v1/admin/entry-animation"+route.path, auth, `{}`, true)
			if w.Code != 401 || !strings.Contains(w.Header().Get("Cache-Control"), "no-store") {
				t.Fatalf("private route allowed/cached: %d %s", w.Code, w.Body)
			}
			if strings.Contains(w.Body.String(), "TANO ARCHIVE") {
				t.Fatal("default content leaked")
			}
		}
	}
	valid := token("admin", 7, time.Minute)
	for _, changes := range []map[string]any{{"role": "user"}, {"role": "admin", "must_change_password": true}} {
		if err := db.Model(&user).Updates(changes).Error; err != nil {
			t.Fatal(err)
		}
		if w := call("GET", "/api/v1/admin/entry-animation/player", valid, "", false); w.Code != 403 {
			t.Fatalf("restricted account read player: %d", w.Code)
		}
	}
	db.Model(&user).Updates(map[string]any{"role": "admin", "must_change_password": false})
	if w := call("PUT", "/api/v1/admin/entry-animation", valid, `{}`, false); w.Code != 403 {
		t.Fatal("missing CSRF accepted")
	}
	var imageData bytes.Buffer
	if err := png.Encode(&imageData, image.NewRGBA(image.Rect(0, 0, 13, 17))); err != nil {
		t.Fatal(err)
	}
	icon := "data:image/png;base64," + base64.StdEncoding.EncodeToString(imageData.Bytes())
	body := `{"overrides":{"opening_title":"PRIVATE-ENTRY-CANARY","welcome_title":""},"icon_data_url":"` + icon + `"}`
	if w := call("PUT", "/api/v1/admin/entry-animation", valid, body, true); w.Code != 200 {
		t.Fatalf("save: %d %s", w.Code, w.Body)
	}
	w := call("GET", "/api/v1/admin/entry-animation/player", valid, "", false)
	var doc struct {
		HTML     string `json:"html"`
		Duration int    `json:"duration_ms"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &doc); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || !strings.Contains(doc.HTML, "PRIVATE-ENTRY-CANARY") || !strings.Contains(doc.HTML, "站点标题") || doc.Duration != 12200 {
		t.Fatal("saved player content missing")
	}
	if !strings.Contains(doc.HTML, icon) {
		t.Fatal("saved private icon missing")
	}
	preview := call("POST", "/api/v1/admin/entry-animation/preview", valid, `{"overrides":{"opening_title":"UNSAVED-PREVIEW"}}`, true)
	if preview.Code != 200 || !strings.Contains(preview.Body.String(), "UNSAVED-PREVIEW") {
		t.Fatal("preview failed")
	}
	var stored model.SiteConfig
	if err := db.Where("key = ?", entryanimation.ConfigKey).First(&stored).Error; err != nil {
		t.Fatal(err)
	}
	if strings.Contains(stored.Value, "UNSAVED-PREVIEW") || stored.Type != "private" {
		t.Fatal("preview persisted or storage not private")
	}
	for _, path := range []string{"/api/v1/config/public", "/api/v1/config/about", "/api/v1/admin/config"} {
		w := call("GET", path, valid, "", false)
		if w.Code != 200 || strings.Contains(w.Body.String(), entryanimation.ConfigKey) || strings.Contains(w.Body.String(), "PRIVATE-ENTRY-CANARY") || strings.Contains(w.Body.String(), icon) {
			t.Fatalf("private settings escaped into %s: %s", path, w.Body)
		}
	}
	if w := call("PUT", "/api/v1/admin/entry-animation", valid, `{"overrides":{"unknown":"bad"}}`, true); w.Code != 400 {
		t.Fatal("invalid settings accepted")
	}
	if w := call("PUT", "/api/v1/admin/entry-animation", valid, `{"overrides":{},"icon_data_url":""}`, true); w.Code != 200 {
		t.Fatal("reset failed")
	}
	// A broken restored record must remain repairable from the settings page.
	if err := db.Model(&model.SiteConfig{}).Where("key = ?", entryanimation.ConfigKey).Update("value", "{broken").Error; err != nil {
		t.Fatal(err)
	}
	recovery := call("GET", "/api/v1/admin/entry-animation", valid, "", false)
	if recovery.Code != 200 || !strings.Contains(recovery.Body.String(), `"warning"`) {
		t.Fatal("invalid stored config did not expose recoverable defaults")
	}
	if w := call("GET", "/api/v1/admin/entry-animation/player", valid, "", false); w.Code != 500 {
		t.Fatal("invalid stored config was played")
	}
	if w := call("POST", "/api/v1/admin/entry-animation/preview", valid, `{"overrides":{}}`, true); w.Code != 200 {
		t.Fatal("valid preview depends on broken stored config")
	}
	if w := call("PUT", "/api/v1/admin/entry-animation", valid, `{"overrides":{}}`, true); w.Code != 200 {
		t.Fatal("cannot repair broken stored config")
	}
}
