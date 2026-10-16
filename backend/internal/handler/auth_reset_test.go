package handler

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
	"tano_blog/backend/internal/utils"
)

func TestPasswordResetSupportsLongUsernameAfterRestore(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		name := "fresh schema"
		if legacy {
			name = "legacy varchar reset token"
		}
		t.Run(name, func(t *testing.T) {
			db := testutil.Database(t)
			if legacy {
				if err := db.AutoMigrate(&model.User{}); err != nil {
					t.Fatal(err)
				}
				if err := db.Exec("ALTER TABLE users ALTER COLUMN reset_token TYPE varchar(500)").Error; err != nil {
					t.Fatal(err)
				}
			}
			if err := model.AutoMigrate(db); err != nil {
				t.Fatal(err)
			}
			user := model.User{
				Username:     strings.Repeat("测", 50),
				Email:        "restored-reset@example.test",
				PasswordHash: "old-password-hash",
				TokenVersion: 5,
				SessionEpoch: "11111111-2222-4333-8444-555555555555",
			}
			if err := db.Create(&user).Error; err != nil {
				t.Fatal(err)
			}
			cfg := &config.JWTConfig{Secret: "password-reset-integration-secret", Expiration: time.Hour}
			h := NewAuthHandler(db, cfg, nil)
			router := gin.New()
			router.POST("/forgot", h.ForgotPassword)
			router.POST("/reset", h.ResetPassword)
			if w := authSessionCall(router, "/forgot", fmt.Sprintf(`{"email":%q}`, user.Email), nil); w.Code != http.StatusOK {
				t.Fatalf("password reset request status %d: %s", w.Code, w.Body)
			}
			var stored model.User
			if err := db.First(&stored, user.ID).Error; err != nil {
				t.Fatal(err)
			}
			if len(stored.ResetToken) <= 500 {
				t.Fatalf("long reset token was not persisted intact: stored %d characters", len(stored.ResetToken))
			}
			claims, err := utils.ParseJWT(stored.ResetToken, cfg.Secret)
			if err != nil {
				t.Fatalf("stored reset token is invalid: %v", err)
			}
			if claims.UserID != user.ID || claims.Username != user.Username || claims.Role != "reset" || claims.SessionEpoch != user.SessionEpoch {
				t.Fatal("stored reset token lost the restored account identity")
			}
			w := authSessionCall(router, "/reset", fmt.Sprintf(`{"token":%q,"new_password":"changed-password"}`, stored.ResetToken), nil)
			if w.Code != http.StatusOK {
				t.Fatalf("password reset status %d: %s", w.Code, w.Body)
			}
			if err := db.First(&stored, user.ID).Error; err != nil {
				t.Fatal(err)
			}
			if !utils.CheckPassword("changed-password", stored.PasswordHash) || stored.ResetToken != "" || stored.TokenVersion != 6 || stored.SessionEpoch != user.SessionEpoch {
				t.Fatal("password reset did not update credentials and consume its token")
			}
		})
	}
}
