package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
	"tano_blog/backend/internal/utils"
)

func TestAuthenticationRejectsNonSessionCredentials(t *testing.T) {
	db := testutil.Database(t, &model.User{})
	user := model.User{Username: "session-admin", Email: "session@example.test", Role: "admin", PasswordHash: "fixture", TokenVersion: 7}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	cfg := &config.JWTConfig{Secret: "isolated-session-regression-key"}
	for _, tc := range []struct {
		name, role, purpose string
		expires             bool
		want                int
	}{
		{"legacy session", "admin", "", true, 200},
		{"session", "admin", "session", true, 200},
		{"pending TOTP", "totp_pending", "", true, 401},
		{"password reset", "reset", "", true, 401},
		{"wrong purpose", "admin", "reset", true, 401},
		{"missing expiry", "admin", "session", false, 401},
	} {
		t.Run(tc.name, func(t *testing.T) {
			claims := jwt.MapClaims{"user_id": user.ID.String(), "username": user.Username, "role": tc.role, "purpose": tc.purpose, "token_version": 7, "iss": "tano_blog"}
			if tc.expires {
				claims["exp"] = time.Now().Add(time.Minute).Unix()
			}
			token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(cfg.Secret))
			if err != nil {
				t.Fatal(err)
			}
			r := gin.New()
			r.GET("/required", AuthRequired(cfg, db), RoleRequired("admin"), func(c *gin.Context) { c.Status(http.StatusOK) })
			r.GET("/optional", OptionalAuth(cfg, db), func(c *gin.Context) {
				if c.GetString("role") == "admin" {
					c.Status(http.StatusOK)
				} else {
					c.Status(http.StatusUnauthorized)
				}
			})
			for _, path := range []string{"/required", "/optional"} {
				req := httptest.NewRequest("GET", path, nil)
				req.Header.Set("Authorization", "Bearer "+token)
				w := httptest.NewRecorder()
				r.ServeHTTP(w, req)
				if w.Code != tc.want {
					t.Errorf("%s status=%d, want %d", path, w.Code, tc.want)
				}
			}
		})
	}
}

func TestAuthenticationBindsSessionsToRestoreEpoch(t *testing.T) {
	db := testutil.Database(t, &model.User{})
	user := model.User{Username: "epoch-user", Email: "epoch@example.test", Role: "admin", PasswordHash: "fixture", TokenVersion: 5, SessionEpoch: "after-restore"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	cfg := &config.JWTConfig{Secret: "epoch-test-secret"}
	r := gin.New()
	r.GET("/required", AuthRequired(cfg, db), func(c *gin.Context) { c.Status(200) })
	r.GET("/optional", OptionalAuth(cfg, db), func(c *gin.Context) {
		if c.GetString("role") == "admin" {
			c.Status(200)
		} else {
			c.Status(401)
		}
	})
	for _, epoch := range []string{"", "before-restore", "after-restore"} {
		token, err := utils.GenerateJWTWithSession(user.ID, user.Username, user.Role, cfg.Secret, time.Minute, 5, epoch)
		if err != nil {
			t.Fatal(err)
		}
		want := 401
		if epoch == "after-restore" {
			want = 200
		}
		for _, path := range []string{"/required", "/optional"} {
			req := httptest.NewRequest("GET", path, nil)
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != want {
				t.Errorf("epoch=%q path=%s status=%d want=%d", epoch, path, w.Code, want)
			}
		}
	}
}
