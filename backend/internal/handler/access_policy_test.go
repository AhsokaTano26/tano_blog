package handler

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/middleware"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/testutil"
	"tano_blog/backend/internal/utils"
)

func accessPolicyCall(r *gin.Engine, method, path, body string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Render-Request", "1")
	for _, cookie := range cookies {
		if cookie != nil {
			req.AddCookie(cookie)
		}
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func accessPolicyTOTP(t *testing.T, secret string) string {
	t.Helper()
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		t.Fatal(err)
	}
	var counter [8]byte
	binary.BigEndian.PutUint64(counter[:], uint64(time.Now().Unix()/30))
	mac := hmac.New(sha1.New, key)
	_, _ = mac.Write(counter[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	return fmt.Sprintf("%06d", (binary.BigEndian.Uint32(sum[offset:offset+4])&0x7fffffff)%1000000)
}

func TestAuditTOTPSetupPreservesEnabledSecret(t *testing.T) {
	db := testutil.Database(t, &model.User{})
	hash, err := utils.HashPassword("correct-password")
	if err != nil {
		t.Fatal(err)
	}
	user := model.User{Username: "totp-owner", Email: "owner@example.test", Role: "admin", PasswordHash: hash, TOTPEnabled: true, TOTPSecret: "JBSWY3DPEHPK3PXP"}
	contentCreate(t, db, &user)
	cfg := &config.JWTConfig{Secret: "audit-session-key", Expiration: time.Hour}
	h := NewAuthHandler(db, cfg, nil)
	r := gin.New()
	r.Use(middleware.AuthRequired(cfg, db))
	r.POST("/setup", h.TOTPSetup)
	r.DELETE("/totp", h.TOTPDisable)
	token, err := utils.GenerateJWTWithVersion(user.ID, user.Username, user.Role, cfg.Secret, time.Hour, user.TokenVersion)
	if err != nil {
		t.Fatal(err)
	}
	cookie := &http.Cookie{Name: "jwt", Value: token}
	w := accessPolicyCall(r, http.MethodPost, "/setup", `{}`, cookie)
	if w.Code != http.StatusConflict {
		t.Errorf("enabled setup status = %d, want 409", w.Code)
	}
	var stored model.User
	if err := db.First(&stored, user.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.TOTPSecret != user.TOTPSecret || !stored.TOTPEnabled {
		t.Error("setup replaced the enabled TOTP secret or disabled the factor")
	}
	var response map[string]json.RawMessage
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response["secret"] != nil || response["qr_code"] != nil {
		t.Error("enabled setup disclosed enrollment credentials")
	}
	w = accessPolicyCall(r, http.MethodDelete, "/totp", fmt.Sprintf(`{"totp_code":%q}`, accessPolicyTOTP(t, user.TOTPSecret)), cookie)
	if w.Code != http.StatusOK {
		t.Errorf("original factor no longer disables TOTP: status %d", w.Code)
	}
	if err := db.First(&stored, user.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.TOTPEnabled || stored.TOTPSecret != "" {
		t.Error("successful disable did not clear the enabled factor")
	}
}

func TestAuditTOTPPendingEnrollmentRequiresValidCode(t *testing.T) {
	db := testutil.Database(t, &model.User{})
	user := model.User{Username: "pending-owner", Email: "pending@example.test", Role: "admin", PasswordHash: "unused"}
	contentCreate(t, db, &user)
	cfg := &config.JWTConfig{Secret: "audit-session-key", Expiration: time.Hour}
	h := NewAuthHandler(db, cfg, nil)
	r := gin.New()
	r.Use(middleware.AuthRequired(cfg, db))
	r.POST("/setup", h.TOTPSetup)
	r.POST("/verify", h.TOTPVerify)
	token, err := utils.GenerateJWTWithVersion(user.ID, user.Username, user.Role, cfg.Secret, time.Hour, user.TokenVersion)
	if err != nil {
		t.Fatal(err)
	}
	cookie := &http.Cookie{Name: "jwt", Value: token}
	w := accessPolicyCall(r, http.MethodPost, "/setup", `{}`, cookie)
	var response struct {
		Secret string `json:"secret"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if w.Code != http.StatusOK || response.Secret == "" {
		t.Fatalf("new enrollment status %d, secret present=%t", w.Code, response.Secret != "")
	}
	if w := accessPolicyCall(r, http.MethodPost, "/verify", `{"code":"not-a-code"}`, cookie); w.Code != http.StatusUnauthorized {
		t.Errorf("invalid enrollment code status %d", w.Code)
	}
	var stored model.User
	if err := db.First(&stored, user.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.TOTPEnabled {
		t.Error("setup or invalid code enabled the pending factor")
	}
	w = accessPolicyCall(r, http.MethodPost, "/verify", fmt.Sprintf(`{"code":%q}`, accessPolicyTOTP(t, response.Secret)), cookie)
	if w.Code != http.StatusOK {
		t.Errorf("valid enrollment code status %d", w.Code)
	}
	if err := db.First(&stored, user.ID).Error; err != nil {
		t.Fatal(err)
	}
	if !stored.TOTPEnabled || stored.TOTPSecret != response.Secret {
		t.Error("valid code did not enable the enrolled factor")
	}
}

func TestAuditTOTPVerifyCannotEnableReplacedPendingSecret(t *testing.T) {
	db := testutil.Database(t, &model.User{})
	user := model.User{Username: "pending-race", Email: "race@example.test", Role: "admin", PasswordHash: "unused", TOTPSecret: "JBSWY3DPEHPK3PXP"}
	contentCreate(t, db, &user)
	const replacement = "KRUGS4ZANFZSAYJA"
	replaced := false
	if err := db.Callback().Update().Before("gorm:update").Register("audit_pending_secret_replaced", func(tx *gorm.DB) {
		if tx.Statement.Table != "users" || replaced {
			return
		}
		replaced = true
		if err := tx.Session(&gorm.Session{NewDB: true}).Exec("UPDATE users SET totp_secret = ? WHERE id = ?", replacement, user.ID).Error; err != nil {
			_ = tx.AddError(err)
		}
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Callback().Update().Remove("audit_pending_secret_replaced") })
	cfg := &config.JWTConfig{Secret: "audit-session-key", Expiration: time.Hour}
	r := gin.New()
	r.Use(middleware.AuthRequired(cfg, db))
	r.POST("/verify", NewAuthHandler(db, cfg, nil).TOTPVerify)
	token, err := utils.GenerateJWTWithVersion(user.ID, user.Username, user.Role, cfg.Secret, time.Hour, user.TokenVersion)
	if err != nil {
		t.Fatal(err)
	}
	w := accessPolicyCall(r, http.MethodPost, "/verify", fmt.Sprintf(`{"code":%q}`, accessPolicyTOTP(t, user.TOTPSecret)), &http.Cookie{Name: "jwt", Value: token})
	var stored model.User
	if err := db.First(&stored, user.ID).Error; err != nil {
		t.Fatal(err)
	}
	if w.Code != http.StatusConflict || stored.TOTPEnabled {
		t.Errorf("code for replaced enrollment enabled another factor: status %d, enabled=%t", w.Code, stored.TOTPEnabled)
	}
}

func TestAuditTOTPEnrollmentWriteFailureDoesNotReportSuccess(t *testing.T) {
	for _, operation := range []string{"setup", "verify", "disable"} {
		t.Run(operation, func(t *testing.T) {
			db := testutil.Database(t, &model.User{})
			user := model.User{Username: "factor-write", Email: "factor-write@example.test", Role: "admin", PasswordHash: "unused", TOTPSecret: "JBSWY3DPEHPK3PXP", TOTPEnabled: operation == "disable"}
			contentCreate(t, db, &user)
			if err := db.Callback().Update().Before("gorm:update").Register("audit_factor_write_failure", func(tx *gorm.DB) {
				if tx.Statement.Table == "users" {
					_ = tx.AddError(errors.New("factor write unavailable"))
				}
			}); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = db.Callback().Update().Remove("audit_factor_write_failure") })
			cfg := &config.JWTConfig{Secret: "audit-session-key", Expiration: time.Hour}
			h := NewAuthHandler(db, cfg, nil)
			r := gin.New()
			r.Use(middleware.AuthRequired(cfg, db))
			r.POST("/setup", h.TOTPSetup)
			r.POST("/verify", h.TOTPVerify)
			r.POST("/disable", h.TOTPDisable)
			token, err := utils.GenerateJWTWithVersion(user.ID, user.Username, user.Role, cfg.Secret, time.Hour, user.TokenVersion)
			if err != nil {
				t.Fatal(err)
			}
			body := `{}`
			if operation == "verify" {
				body = fmt.Sprintf(`{"code":%q}`, accessPolicyTOTP(t, user.TOTPSecret))
			} else if operation == "disable" {
				body = fmt.Sprintf(`{"totp_code":%q}`, accessPolicyTOTP(t, user.TOTPSecret))
			}
			w := accessPolicyCall(r, http.MethodPost, "/"+operation, body, &http.Cookie{Name: "jwt", Value: token})
			var stored model.User
			if err := db.First(&stored, user.ID).Error; err != nil {
				t.Fatal(err)
			}
			if w.Code != http.StatusInternalServerError || stored.TOTPEnabled != user.TOTPEnabled || stored.TOTPSecret != user.TOTPSecret {
				t.Errorf("failed %s status %d, enabled=%t, secret unchanged=%t", operation, w.Code, stored.TOTPEnabled, stored.TOTPSecret == user.TOTPSecret)
			}
		})
	}
}

func accessPolicyDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.Database(t, &model.Post{}, &model.PostSeries{}, &model.PostRevision{}, &model.PostReaction{}, &model.Comment{}, &model.CommentReaction{}, &model.SiteConfig{}, &model.Notification{})
}

func accessPolicyRouter(db *gorm.DB) (*gin.Engine, *PostHandler) {
	r := gin.New()
	_ = r.SetTrustedProxies(nil)
	p := NewPostHandler(repository.NewPostRepo(db), "audit-resource-key")
	c := NewCommentHandler(repository.NewCommentRepo(db), db, nil, "audit-resource-key")
	r.GET("/posts/:slug", p.GetBySlug)
	r.POST("/posts/:slug/verify-password", p.VerifyPassword)
	r.POST("/posts/:slug/view", p.RecordView)
	r.POST("/posts/:slug/reaction", p.ToggleReaction)
	r.GET("/posts/:slug/comments", c.ListByPost)
	r.POST("/posts/:slug/comments", c.Create)
	r.POST("/posts/:slug/comments/:id/reaction", c.ToggleReaction)
	return r, p
}

func accessPolicyUnlock(t *testing.T, r *gin.Engine, post model.Post, password string) *http.Cookie {
	t.Helper()
	w := accessPolicyCall(r, http.MethodPost, "/posts/"+post.Slug+"/verify-password", fmt.Sprintf(`{"password":%q}`, password))
	if w.Code != http.StatusOK {
		t.Fatalf("password verification status %d", w.Code)
	}
	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == "post_access_"+post.ID.String() {
			return cookie
		}
	}
	t.Fatal("password verification did not set access cookie")
	return nil
}

func accessPolicyAssertLocked(t *testing.T, r *gin.Engine, post model.Post, comment model.Comment, cookie *http.Cookie) {
	t.Helper()
	base := "/posts/" + post.Slug
	for _, tc := range []struct{ method, path, body string }{
		{http.MethodGet, base, ""},
		{http.MethodPost, base + "/view", `{}`},
		{http.MethodPost, base + "/reaction", `{"emoji":"👍"}`},
		{http.MethodGet, base + "/comments", ""},
		{http.MethodPost, base + "/comments", `{"nickname":"reader","content":"must not save"}`},
		{http.MethodPost, base + "/comments/" + comment.ID.String() + "/reaction", `{"emoji":"👍"}`},
	} {
		w := accessPolicyCall(r, tc.method, tc.path, tc.body, cookie)
		if tc.path == base {
			var response struct {
				Post map[string]json.RawMessage `json:"post"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
				t.Fatal(err)
			}
			if w.Code != http.StatusOK || response.Post["content"] != nil {
				t.Errorf("locked article content accessible: status %d, content present=%t", w.Code, response.Post["content"] != nil)
			}
		} else if w.Code != http.StatusForbidden {
			t.Errorf("locked %s %s status %d, want 403", tc.method, tc.path, w.Code)
		}
	}
}

func accessPolicyAssertUnlocked(t *testing.T, r *gin.Engine, post model.Post, comment model.Comment, cookie *http.Cookie) {
	t.Helper()
	base := "/posts/" + post.Slug
	for _, tc := range []struct {
		method, path, body string
		want               int
	}{
		{http.MethodGet, base, "", http.StatusOK},
		{http.MethodPost, base + "/view", `{}`, http.StatusOK},
		{http.MethodPost, base + "/reaction", `{"emoji":"👍"}`, http.StatusOK},
		{http.MethodGet, base + "/comments", "", http.StatusOK},
		{http.MethodPost, base + "/comments", `{"nickname":"reader","content":"permitted comment"}`, http.StatusCreated},
		{http.MethodPost, base + "/comments/" + comment.ID.String() + "/reaction", `{"emoji":"👍"}`, http.StatusOK},
	} {
		w := accessPolicyCall(r, tc.method, tc.path, tc.body, cookie)
		if w.Code != tc.want {
			t.Errorf("unlocked %s %s status %d, want %d", tc.method, tc.path, w.Code, tc.want)
		}
		if tc.path == base && !strings.Contains(w.Body.String(), "confidential-body") {
			t.Error("fresh access cookie did not disclose the authorized article body")
		}
	}
}

func TestAuditPostPasswordChangesRevokeExistingCookies(t *testing.T) {
	for _, nextPassword := range []string{"changed-password", "initial-password"} {
		t.Run(nextPassword, func(t *testing.T) {
			db := accessPolicyDB(t)
			hash, err := utils.HashPassword("initial-password")
			if err != nil {
				t.Fatal(err)
			}
			post := model.Post{Title: "protected", Slug: "protected", Content: "confidential-body", Status: "published", PasswordHash: hash}
			contentCreate(t, db, &post)
			comment := model.Comment{PostID: post.ID, Nickname: "existing", Content: "private-comment", Status: "approved"}
			contentCreate(t, db, &comment)
			r, h := accessPolicyRouter(db)
			admin := model.User{Username: "editor", Email: "editor@example.test", PasswordHash: "unused", Role: "admin"}
			contentCreate(t, db, &admin)
			cookie := accessPolicyUnlock(t, r, post, "initial-password")
			accessPolicyAssertUnlocked(t, r, post, comment, cookie)
			w := contentCall(t, admin, h.Update, http.MethodPut, "/"+post.ID.String(), fmt.Sprintf(`{"password":%q}`, nextPassword))
			if w.Code != http.StatusOK {
				t.Fatalf("password update status %d", w.Code)
			}
			accessPolicyAssertLocked(t, r, post, comment, cookie)
			fresh := accessPolicyUnlock(t, r, post, nextPassword)
			accessPolicyAssertUnlocked(t, r, post, comment, fresh)
		})
	}
}

func TestAuditPostCookiesRejectMissingForgedAndIndependentResources(t *testing.T) {
	db := accessPolicyDB(t)
	hash, err := utils.HashPassword("shared-password")
	if err != nil {
		t.Fatal(err)
	}
	posts := []model.Post{
		{Title: "first", Slug: "first", Content: "confidential-body", Status: "published", PasswordHash: hash},
		{Title: "second", Slug: "second", Content: "confidential-body", Status: "published", PasswordHash: hash},
	}
	contentCreate(t, db, &posts)
	comment := model.Comment{PostID: posts[1].ID, Nickname: "reader", Content: "private", Status: "approved"}
	contentCreate(t, db, &comment)
	r, _ := accessPolicyRouter(db)
	cookie := accessPolicyUnlock(t, r, posts[0], "shared-password")
	cookie.Name = "post_access_" + posts[1].ID.String()
	for _, candidate := range []*http.Cookie{nil, {Name: cookie.Name, Value: "forged"}, cookie} {
		accessPolicyAssertLocked(t, r, posts[1], comment, candidate)
	}
}

func TestAuditLegacyPostCookieFailsClosed(t *testing.T) {
	db := accessPolicyDB(t)
	post := model.Post{Title: "protected", Slug: "protected", Content: "private", Status: "published", PasswordHash: "current-hash"}
	contentCreate(t, db, &post)
	comment := model.Comment{PostID: post.ID, Nickname: "reader", Content: "private", Status: "approved"}
	contentCreate(t, db, &comment)
	r, _ := accessPolicyRouter(db)
	token, err := utils.GenerateResourceToken(utils.ResourcePost, post.ID.String(), "audit-resource-key", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	accessPolicyAssertLocked(t, r, post, comment, &http.Cookie{Name: "post_access_" + post.ID.String(), Value: token})
}

func TestAuditLegacyMusicCookieFailsClosed(t *testing.T) {
	db := testutil.Database(t, &model.SiteConfig{})
	contentCreate(t, db, &[]model.SiteConfig{{Key: "music_password", Value: "current-password"}, {Key: "music_playlist", Value: "private-tracks"}})
	r := gin.New()
	r.GET("/music", NewSiteConfigHandler(db, nil, "audit-resource-key", "").GetMusic)
	token, err := utils.GenerateResourceToken(utils.ResourceMusic, "library", "audit-resource-key", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	w := accessPolicyCall(r, http.MethodGet, "/music", "", &http.Cookie{Name: "music_access", Value: token})
	var response struct {
		Config map[string]json.RawMessage `json:"config"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if w.Code != http.StatusOK || response.Config["music_playlist"] != nil {
		t.Errorf("legacy music cookie exposed protected playlist: status %d, playlist present=%t", w.Code, response.Config["music_playlist"] != nil)
	}
}

func TestAuditMusicPasswordChangesRevokeExistingCookies(t *testing.T) {
	for _, operation := range []string{"change password", "reset same password", "clear and re-enable"} {
		t.Run(operation, func(t *testing.T) {
			db := testutil.Database(t, &model.SiteConfig{})
			contentCreate(t, db, &[]model.SiteConfig{
				{Key: "music_password", Value: "initial-password", UpdatedAt: time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)},
				{Key: "music_playlist", Value: "private-tracks"},
				{Key: "music_page_config", Value: "private-page"},
			})
			h := NewSiteConfigHandler(db, nil, "audit-resource-key", "")
			r := gin.New()
			r.GET("/music", h.GetMusic)
			issue := func() *http.Cookie {
				var password model.SiteConfig
				if err := db.Where("key = ?", "music_password").First(&password).Error; err != nil {
					t.Fatal(err)
				}
				credential := utils.ResourceCredentialRevision(password.Value, password.UpdatedAt)
				token, err := utils.GenerateBoundResourceToken(utils.ResourceMusic, "library", credential, "audit-resource-key", time.Hour)
				if err != nil {
					t.Fatal(err)
				}
				return &http.Cookie{Name: "music_access", Value: token}
			}
			check := func(cookie *http.Cookie, wantAccess bool) {
				w := accessPolicyCall(r, http.MethodGet, "/music", "", cookie)
				var response struct {
					Config map[string]json.RawMessage `json:"config"`
				}
				if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
					t.Fatal(err)
				}
				if w.Code != http.StatusOK || (response.Config["music_playlist"] != nil) != wantAccess || (response.Config["music_page_config"] != nil) != wantAccess {
					t.Errorf("music status %d, playlist access=%t, page access=%t; want access=%t", w.Code, response.Config["music_playlist"] != nil, response.Config["music_page_config"] != nil, wantAccess)
				}
				if response.Config["music_password"] != nil {
					t.Error("music response disclosed its password")
				}
			}
			cookie := issue()
			check(cookie, true)
			check(nil, false)
			check(&http.Cookie{Name: "music_access", Value: "forged"}, false)
			nextPassword := "initial-password"
			if operation == "change password" {
				nextPassword = "changed-password"
			}
			if operation == "clear and re-enable" {
				if w := configUpdateCall(t, h, map[string]string{"music_password": ""}); w.Code != http.StatusOK {
					t.Fatalf("music password clear status %d", w.Code)
				}
				check(nil, true)
			}
			if w := configUpdateCall(t, h, map[string]string{"music_password": nextPassword}); w.Code != http.StatusOK {
				t.Fatalf("music password update status %d", w.Code)
			}
			check(cookie, false)
			check(issue(), true)
		})
	}
}

func TestAuditPublicSearchCannotProbeProtectedContent(t *testing.T) {
	db := accessPolicyDB(t)
	contentCreate(t, db, &[]model.Post{
		{Title: "public heading", Slug: "protected", Excerpt: "public summary", Content: "secret-probe-4b7f", Status: "published", PasswordHash: "protected"},
		{Title: "ordinary", Slug: "ordinary", Content: "visible-body-55d3", Status: "published"},
	})
	r := gin.New()
	r.GET("/posts", NewPostHandler(repository.NewPostRepo(db), "audit-resource-key").ListPublic)
	for _, tc := range []struct {
		search string
		want   int64
	}{
		{"secret-probe-4b7f", 0}, {"public%20heading", 1}, {"public%20summary", 1}, {"visible-body-55d3", 1},
	} {
		for _, page := range []string{"1", "2"} {
			w := accessPolicyCall(r, http.MethodGet, "/posts?search="+tc.search+"&page="+page+"&page_size=1", "")
			var response struct {
				Total int64        `json:"total"`
				Items []model.Post `json:"items"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
				t.Fatal(err)
			}
			wantItems := int(tc.want)
			if page == "2" {
				wantItems = 0
			}
			if w.Code != http.StatusOK || response.Total != tc.want || len(response.Items) != wantItems {
				t.Errorf("search %q page %s: status %d, total %d, items %d; want total %d, items %d", tc.search, page, w.Code, response.Total, len(response.Items), tc.want, wantItems)
			}
		}
	}
}

func TestAuditGlobalCommentPolicyControlsSubmissions(t *testing.T) {
	for _, tc := range []struct {
		name, setting                          string
		missing, articleDisabled, queryFailure bool
		want                                   int
	}{
		{name: "global disabled", setting: "false", want: http.StatusForbidden},
		{name: "global enabled", setting: "true", want: http.StatusCreated},
		{name: "legacy missing", missing: true, want: http.StatusCreated},
		{name: "article disabled", setting: "true", articleDisabled: true, want: http.StatusForbidden},
		{name: "policy unavailable", setting: "true", queryFailure: true, want: http.StatusServiceUnavailable},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := accessPolicyDB(t)
			post := model.Post{Title: "article", Slug: "article", Content: "body", Status: "published"}
			contentCreate(t, db, &post)
			if tc.articleDisabled {
				if err := db.Model(&post).Update("allow_comment", false).Error; err != nil {
					t.Fatal(err)
				}
			}
			if !tc.missing {
				contentCreate(t, db, &model.SiteConfig{Key: "comment_enabled", Value: tc.setting})
			}
			if tc.queryFailure {
				if err := db.Callback().Query().Before("gorm:query").Register("audit_comment_policy_failure", func(tx *gorm.DB) {
					if tx.Statement.Table == "site_configs" {
						_ = tx.AddError(errors.New("policy lookup unavailable"))
					}
				}); err != nil {
					t.Fatal(err)
				}
				t.Cleanup(func() { _ = db.Callback().Query().Remove("audit_comment_policy_failure") })
			}
			r, _ := accessPolicyRouter(db)
			w := accessPolicyCall(r, http.MethodPost, "/posts/article/comments", `{"nickname":"reader","content":"new comment"}`)
			var count int64
			if err := db.Model(&model.Comment{}).Count(&count).Error; err != nil {
				t.Fatal(err)
			}
			wantCount := int64(0)
			if tc.want == http.StatusCreated {
				wantCount = 1
			}
			if w.Code != tc.want || count != wantCount {
				t.Errorf("comment status %d, rows %d; want status %d, rows %d", w.Code, count, tc.want, wantCount)
			}
		})
	}
}
