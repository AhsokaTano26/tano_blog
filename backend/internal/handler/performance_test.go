package handler

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"net/http"
	"net/http/httptest"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/testutil"
	"tano_blog/backend/internal/utils"
	"testing"
)

func TestAdminDetailPreservesTagsAndSeriesForLeanListEditing(t *testing.T) {
	db := testutil.Database(t, &model.Post{}, &model.Series{}, &model.PostSeries{})
	tag := model.Tag{Name: "kept tag", Slug: "tag"}
	if err := db.Create(&tag).Error; err != nil {
		t.Fatal("create tag:", err)
	}
	series := model.Series{Name: "kept series", Slug: "series"}
	if err := db.Create(&series).Error; err != nil {
		t.Fatal("create series:", err)
	}
	post := model.Post{Title: "article", Slug: "article", Content: "body", Status: "published", PreviewToken: uuid.NewString(), Tags: []model.Tag{tag}}
	if err := db.Create(&post).Error; err != nil {
		t.Fatal("create post:", err)
	}
	if err := db.Create(&model.PostSeries{PostID: post.ID, SeriesID: series.ID}).Error; err != nil {
		t.Fatal("create series membership:", err)
	}
	router := gin.New()
	router.GET("/posts/:id", NewPostHandler(repository.NewPostRepo(db), "test").AdminGet)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest("GET", "/posts/"+post.ID.String(), nil))
	var result struct {
		Post model.Post `json:"post"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 200 || result.Post.Content != "body" || len(result.Post.Tags) != 1 || len(result.Post.Series) != 1 {
		t.Fatalf("detail dropped editor fields: %s", rec.Body)
	}
	if result.Post.Tags[0].ID != tag.ID || result.Post.Series[0].ID != series.ID {
		t.Fatalf("detail loaded wrong relationships: %s", rec.Body)
	}
}

func TestPublicConfigNeverContainsProtectedMusic(t *testing.T) {
	db := testutil.Database(t, &model.SiteConfig{})
	for key, value := range map[string]string{"site_title": "public", "about_content": "long about", "music_password": "secret", "music_playlist": "private tracks", "music_page_config": "private settings"} {
		db.Create(&model.SiteConfig{Key: key, Value: value, Type: "string"})
	}
	handler := NewSiteConfigHandler(db, nil, "test-secret", "")
	router := gin.New()
	router.GET("/config/public", handler.GetPublic)
	router.GET("/config/music", handler.GetMusic)
	token, _ := utils.GenerateResourceToken(utils.ResourceMusic, "library", "test-secret", 3600_000_000_000)
	for _, authorized := range []bool{false, true} {
		for _, path := range []string{"/config/public", "/config/music"} {
			req := httptest.NewRequest("GET", path, nil)
			if authorized {
				req.AddCookie(&http.Cookie{Name: "music_access", Value: token})
			}
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			var result struct {
				Config map[string]interface{} `json:"config"`
			}
			json.Unmarshal(rec.Body.Bytes(), &result)
			if rec.Code != 200 {
				t.Fatal(rec.Body.String())
			}
			if _, ok := result.Config["music_password"]; ok {
				t.Fatal("password exposed")
			}
			_, hasMusic := result.Config["music_playlist"]
			if hasMusic != (authorized && path == "/config/music") {
				t.Fatalf("music privacy: %s", rec.Body)
			}
			if path == "/config/public" {
				if _, ok := result.Config["about_content"]; ok {
					t.Fatal("base config loaded about body")
				}
			}
			if path == "/config/music" && rec.Header().Get("Cache-Control") != "private, no-store" {
				t.Fatal("private music may be cached")
			}
		}
	}
}
