package handler

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
	"tano_blog/backend/internal/utils"
)

func configUpdateCall(t *testing.T, h *SiteConfigHandler, input map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	router.PUT("/admin/config", h.Update)
	req := httptest.NewRequest(http.MethodPut, "/admin/config", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestConfigUpdateRejectsUnknownSyncRole(t *testing.T) {
	db := testutil.Database(t, &model.SiteConfig{})
	if err := db.Create(&[]model.SiteConfig{
		{Key: "sync_role", Value: "standby", Type: "string"},
		{Key: "sync_enabled", Value: "true", Type: "string"},
		{Key: "site_title", Value: "original title", Type: "string"},
	}).Error; err != nil {
		t.Fatal(err)
	}
	injected := false
	if err := db.Callback().Query().Before("gorm:query").Register("test_fail_sync_role_once", func(tx *gorm.DB) {
		if tx.Statement.Table == "site_configs" && !injected {
			injected = true
			tx.AddError(errors.New("sync role lookup failed"))
		}
	}); err != nil {
		t.Fatal(err)
	}
	w := configUpdateCall(t, NewSiteConfigHandler(db, nil, "", ""), map[string]string{"site_title": "changed title"})
	if !injected {
		t.Fatal("request did not read the sync role")
	}
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("role lookup failure status %d, want 503: %s", w.Code, w.Body)
	}
	var title model.SiteConfig
	if err := db.Where("key = ?", "site_title").First(&title).Error; err != nil {
		t.Fatal(err)
	}
	if title.Value != "original title" {
		t.Fatalf("site title changed despite an unknown sync role: %q", title.Value)
	}
}

func TestConfigUpdateRollsBackAllValuesOnWriteFailure(t *testing.T) {
	for _, action := range []string{"replace SSH key", "clear SSH key"} {
		t.Run(action, func(t *testing.T) {
			db := testutil.Database(t, &model.SiteConfig{})
			encryptionKey := base64.StdEncoding.EncodeToString([]byte(strings.Repeat("k", 32)))
			originalKey, err := utils.EncryptSyncSecret(encryptionKey, "original private key")
			if err != nil {
				t.Fatal(err)
			}
			original := map[string]string{
				"site_title":               "original title",
				"site_description":         "original description",
				"sync_ssh_private_key_enc": originalKey,
			}
			for key, value := range original {
				if err := db.Create(&model.SiteConfig{Key: key, Value: value, Type: "string"}).Error; err != nil {
					t.Fatal(err)
				}
			}
			if err := db.Exec("ALTER TABLE site_configs ADD CONSTRAINT reject_description CHECK (key <> 'site_description' OR value <> 'rejected')").Error; err != nil {
				t.Fatal(err)
			}
			input := map[string]string{"site_title": "changed title", "site_description": "rejected"}
			if action == "replace SSH key" {
				input["sync_ssh_private_key"] = "-----BEGIN OPENSSH PRIVATE KEY-----\nreplacement\n-----END OPENSSH PRIVATE KEY-----"
			} else {
				input["sync_ssh_private_key_clear"] = "true"
			}
			w := configUpdateCall(t, NewSiteConfigHandler(db, nil, "", encryptionKey), input)
			if w.Code != http.StatusInternalServerError {
				t.Errorf("failed config write status %d, want 500: %s", w.Code, w.Body)
			}
			var rows []model.SiteConfig
			if err := db.Find(&rows).Error; err != nil {
				t.Fatal(err)
			}
			values := make(map[string]string, len(rows))
			for _, row := range rows {
				values[row.Key] = row.Value
			}
			for key, want := range original {
				if values[key] != want {
					t.Errorf("config %s was not rolled back", key)
				}
			}
		})
	}
}

func TestConfigUpdateHonorsStandbyRestrictions(t *testing.T) {
	for _, tc := range []struct {
		name   string
		input  map[string]string
		status int
		role   string
	}{
		{"reject business settings", map[string]string{"site_title": "changed title"}, http.StatusServiceUnavailable, "standby"},
		{"allow promotion", map[string]string{"sync_role": "primary"}, http.StatusOK, "primary"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := testutil.Database(t, &model.SiteConfig{})
			if err := db.Create(&[]model.SiteConfig{
				{Key: "sync_role", Value: "standby", Type: "string"},
				{Key: "sync_enabled", Value: "true", Type: "string"},
				{Key: "site_title", Value: "original title", Type: "string"},
			}).Error; err != nil {
				t.Fatal(err)
			}
			w := configUpdateCall(t, NewSiteConfigHandler(db, nil, "", ""), tc.input)
			if w.Code != tc.status {
				t.Fatalf("status %d, want %d: %s", w.Code, tc.status, w.Body)
			}
			var rows []model.SiteConfig
			if err := db.Find(&rows).Error; err != nil {
				t.Fatal(err)
			}
			values := make(map[string]string, len(rows))
			for _, row := range rows {
				values[row.Key] = row.Value
			}
			if values["sync_role"] != tc.role || values["sync_enabled"] != "true" || values["site_title"] != "original title" {
				t.Fatalf("unexpected standby settings after update: %+v", values)
			}
		})
	}
}

func TestConfigUpdateCommitsValuesAndSSHKeyChanges(t *testing.T) {
	for _, action := range []string{"replace SSH key", "clear SSH key"} {
		t.Run(action, func(t *testing.T) {
			db := testutil.Database(t, &model.SiteConfig{})
			encryptionKey := base64.StdEncoding.EncodeToString([]byte(strings.Repeat("k", 32)))
			originalKey, err := utils.EncryptSyncSecret(encryptionKey, "original private key")
			if err != nil {
				t.Fatal(err)
			}
			if err := db.Create(&[]model.SiteConfig{
				{Key: "site_title", Value: "original title", Type: "string"},
				{Key: "site_description", Value: "original description", Type: "string"},
				{Key: "sync_ssh_private_key_enc", Value: originalKey, Type: "secret"},
			}).Error; err != nil {
				t.Fatal(err)
			}
			privateKey := "-----BEGIN OPENSSH PRIVATE KEY-----\nreplacement\n-----END OPENSSH PRIVATE KEY-----"
			input := map[string]string{"site_title": "changed title", "site_description": "changed description"}
			if action == "replace SSH key" {
				input["sync_ssh_private_key"] = privateKey
			} else {
				input["sync_ssh_private_key_clear"] = "true"
			}
			w := configUpdateCall(t, NewSiteConfigHandler(db, nil, "", encryptionKey), input)
			if w.Code != http.StatusOK {
				t.Fatalf("config update status %d: %s", w.Code, w.Body)
			}
			var rows []model.SiteConfig
			if err := db.Find(&rows).Error; err != nil {
				t.Fatal(err)
			}
			values := make(map[string]string, len(rows))
			for _, row := range rows {
				values[row.Key] = row.Value
			}
			if values["site_title"] != "changed title" || values["site_description"] != "changed description" {
				t.Fatal("successful update did not commit every business setting")
			}
			if action == "replace SSH key" {
				plaintext, err := utils.DecryptSyncSecret(encryptionKey, values["sync_ssh_private_key_enc"])
				if err != nil || plaintext != privateKey {
					t.Fatalf("replacement SSH key was not saved encrypted: %v", err)
				}
			} else if _, exists := values["sync_ssh_private_key_enc"]; exists {
				t.Fatal("successful clear did not remove the SSH key")
			}
		})
	}
}
