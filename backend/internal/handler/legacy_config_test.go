package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
)

func TestLegacyPortalAvailabilityFollowsSavedSettings(t *testing.T) {
	db := testutil.Database(t, &model.SiteConfig{})
	h := NewSiteConfigHandler(db, nil, "", "")
	router := gin.New()
	router.GET("/config/legacy", h.GetLegacy)

	check := func(want bool) {
		t.Helper()
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/config/legacy", nil))
		var body struct {
			Enabled *bool `json:"enabled"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if rec.Code != http.StatusOK || body.Enabled == nil || *body.Enabled != want {
			t.Fatalf("want enabled=%t, got HTTP %d %s", want, rec.Code, rec.Body)
		}
		if !strings.Contains(rec.Header().Get("Cache-Control"), "no-store") {
			t.Fatal("availability must not be cached")
		}
	}

	check(false)
	for _, value := range []string{"true", "false"} {
		if rec := configUpdateCall(t, h, map[string]string{"legacy_ui_enabled": value}); rec.Code != http.StatusOK {
			t.Fatalf("save %q: HTTP %d %s", value, rec.Code, rec.Body)
		}
		check(value == "true")
	}
	if rec := configUpdateCall(t, h, map[string]string{"legacy_ui_enabled": "on"}); rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid setting should return 400, got %d", rec.Code)
	}
	check(false)
}
