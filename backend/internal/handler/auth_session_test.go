package handler

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/middleware"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
	"tano_blog/backend/internal/utils"
)

func authSessionCall(r *gin.Engine, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		req.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func sessionCookie(t *testing.T, w *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == "jwt" {
			return cookie
		}
	}
	t.Fatalf("no session cookie: %s", w.Body)
	return nil
}

func TestLoginAndPasswordChangePreserveRestoredSessionEpoch(t *testing.T) {
	db := testutil.Database(t, &model.User{}, &model.Notification{})
	hash, err := utils.HashPassword("initial-password")
	if err != nil {
		t.Fatal(err)
	}
	u := model.User{Username: "restored-admin", Email: "restored@example.test", Role: "admin", PasswordHash: hash, TokenVersion: 5, SessionEpoch: "new-restore-epoch"}
	if err := db.Create(&u).Error; err != nil {
		t.Fatal(err)
	}
	cfg := &config.JWTConfig{Secret: "auth-integration-secret", Expiration: time.Hour}
	h := NewAuthHandler(db, cfg, nil)
	r := gin.New()
	r.POST("/login", h.Login)
	r.POST("/password", middleware.AuthRequired(cfg, db), h.ChangePassword)
	r.POST("/protected", middleware.AuthRequired(cfg, db), func(c *gin.Context) { c.Status(200) })
	cookie := sessionCookie(t, authSessionCall(r, "/login", `{"username":"restored-admin","password":"initial-password"}`, nil))
	claims, err := utils.ParseJWT(cookie.Value, cfg.Secret)
	if err != nil || claims.SessionEpoch != u.SessionEpoch || !claims.IsSession() {
		t.Fatalf("login claims: %+v, %v", claims, err)
	}
	updated := sessionCookie(t, authSessionCall(r, "/password", `{"old_password":"initial-password","new_password":"changed-password"}`, cookie))
	if w := authSessionCall(r, "/protected", `{}`, updated); w.Code != 200 {
		t.Fatalf("new password session rejected: %s", w.Body)
	}
	if w := authSessionCall(r, "/protected", `{}`, cookie); w.Code != 401 {
		t.Fatalf("old session accepted: %d", w.Code)
	}
}

func TestPendingTOTPIsBoundToRestoreEpoch(t *testing.T) {
	db := testutil.Database(t, &model.User{}, &model.Notification{})
	hash, err := utils.HashPassword("initial-password")
	if err != nil {
		t.Fatal(err)
	}
	u := model.User{Username: "totp-admin", Email: "totp@example.test", Role: "admin", PasswordHash: hash, TokenVersion: 5, SessionEpoch: "current-epoch", TOTPEnabled: true, TOTPSecret: "JBSWY3DPEHPK3PXP"}
	if err := db.Create(&u).Error; err != nil {
		t.Fatal(err)
	}
	cfg := &config.JWTConfig{Secret: "totp-integration-secret", Expiration: time.Hour}
	h := NewAuthHandler(db, cfg, nil)
	r := gin.New()
	r.POST("/login", h.Login)
	r.POST("/totp", h.LoginWithTOTP)
	login := authSessionCall(r, "/login", `{"username":"totp-admin","password":"initial-password"}`, nil)
	var pending struct {
		Token string `json:"totp_token"`
	}
	if err := json.Unmarshal(login.Body.Bytes(), &pending); err != nil || pending.Token == "" {
		t.Fatalf("pending token: %s", login.Body)
	}
	key, _ := base32.StdEncoding.DecodeString(u.TOTPSecret)
	var counter [8]byte
	binary.BigEndian.PutUint64(counter[:], uint64(time.Now().Unix()/30))
	mac := hmac.New(sha1.New, key)
	_, _ = mac.Write(counter[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	code := fmt.Sprintf("%06d", (binary.BigEndian.Uint32(sum[offset:offset+4])&0x7fffffff)%1000000)
	for _, epoch := range []string{"", "previous-epoch"} {
		stale, err := utils.GenerateJWTWithSession(u.ID, u.Username, "totp_pending", cfg.Secret, time.Minute, u.TokenVersion, epoch)
		if err != nil {
			t.Fatal(err)
		}
		w := authSessionCall(r, "/totp", fmt.Sprintf(`{"totp_token":%q,"code":%q}`, stale, code), nil)
		if w.Code != 401 {
			t.Fatalf("stale epoch accepted: %d %s", w.Code, w.Body)
		}
	}
	w := authSessionCall(r, "/totp", fmt.Sprintf(`{"totp_token":%q,"code":%q}`, pending.Token, code), nil)
	cookie := sessionCookie(t, w)
	claims, err := utils.ParseJWT(cookie.Value, cfg.Secret)
	if err != nil || claims.SessionEpoch != u.SessionEpoch || !claims.IsSession() {
		t.Fatalf("TOTP claims: %+v, %v", claims, err)
	}
}
