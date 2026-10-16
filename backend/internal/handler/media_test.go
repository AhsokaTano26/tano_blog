package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
)

func mediaTestHandler(t *testing.T) (*MediaHandler, *gorm.DB, uuid.UUID) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_DSN")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_DSN to run PostgreSQL media integration tests")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	t.Cleanup(func() { sqlDB.Close() })
	db = db.Begin()
	t.Cleanup(func() { db.Rollback() })
	schema := "media_test_" + uuid.New().String()[:8]
	if err := db.Exec("CREATE SCHEMA " + schema).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("SET LOCAL search_path TO " + schema).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.User{}, &model.MediaTag{}, &model.Media{}, &model.GalleryImage{}); err != nil {
		t.Fatal(err)
	}
	user := model.User{Username: "tester", Email: "test@example.test", PasswordHash: "test-only"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	return NewMediaHandler(repository.NewMediaRepo(db), repository.NewGalleryRepo(db), &config.UploadConfig{Dir: t.TempDir(), MaxImageMB: 50}), db, user.ID
}

func TestImageUploadCreatesThumbnailUsedByGallery(t *testing.T) {
	h, db, userID := mediaTestHandler(t)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, _ := writer.CreateFormFile("file", "photo.png")
	if err := png.Encode(part, image.NewRGBA(image.Rect(0, 0, 1200, 600))); err != nil {
		t.Fatal(err)
	}
	writer.Close()
	router := gin.New()
	router.POST("/upload", func(c *gin.Context) { c.Set("user_id", userID.String()); h.Upload(c) })
	req := httptest.NewRequest(http.MethodPost, "/upload", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusCreated {
		t.Fatalf("upload returned %d: %s", response.Code, response.Body)
	}
	var result struct {
		Media model.Media `json:"media"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Media.ThumbnailURL == "" || result.Media.ThumbnailURL == result.Media.URL {
		t.Fatal("upload did not return a separate image thumbnail")
	}
	if _, err := os.Stat(filepath.Join(h.cfg.Dir, filepath.Base(result.Media.ThumbnailURL))); err != nil {
		t.Fatal(err)
	}
	gallery, err := repository.NewGalleryRepo(db).List()
	if err != nil || len(gallery) != 1 {
		t.Fatalf("gallery: %v, %v", gallery, err)
	}
	encoded, _ := json.Marshal(gallery[0])
	var imageData map[string]interface{}
	json.Unmarshal(encoded, &imageData)
	if imageData["thumbnail_url"] != result.Media.ThumbnailURL || gallery[0].URL != result.Media.URL {
		t.Fatal("gallery must expose the thumbnail and retain the original URL")
	}
}

func TestMediaFiltersApplyBeforePaginationAndSearch(t *testing.T) {
	h, db, userID := mediaTestHandler(t)
	for _, item := range []model.Media{
		{Filename: "song.mp3", OriginalName: "holiday song", MimeType: "audio/mpeg", URL: "/song.mp3", UploadedBy: userID},
		{Filename: "photo.png", OriginalName: "holiday photo", MimeType: "image/png", URL: "/photo.png", UploadedBy: userID},
	} {
		if err := db.Create(&item).Error; err != nil {
			t.Fatal(err)
		}
	}
	router := gin.New()
	router.GET("/media", h.List)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/media?type=image&page_size=1&search=holiday", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("list returned %d: %s", response.Code, response.Body)
	}
	var result struct {
		Items []model.Media `json:"items"`
		Total int64         `json:"total"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Total != 1 || len(result.Items) != 1 || result.Items[0].Filename != "photo.png" {
		t.Fatalf("type filtering/search did not happen before pagination: %s", response.Body)
	}
}

func TestBackfillCreatesMissingImageThumbnails(t *testing.T) {
	h, db, userID := mediaTestHandler(t)
	backfiller, ok := interface{}(h).(interface {
		BackfillImageThumbnails(context.Context, ...func(context.Context) (func(), error)) error
	})
	if !ok {
		t.Fatal("media handler does not backfill legacy thumbnails")
	}
	path := filepath.Join(h.cfg.Dir, "legacy.png")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := png.Encode(f, image.NewRGBA(image.Rect(0, 0, 60, 30))); err != nil {
		t.Fatal(err)
	}
	f.Close()
	media := model.Media{Filename: "legacy.png", URL: "/uploads/legacy.png", MimeType: "image/png", UploadedBy: userID}
	if err := db.Create(&media).Error; err != nil {
		t.Fatal(err)
	}
	if err := backfiller.BackfillImageThumbnails(context.Background()); err != nil {
		t.Fatal(err)
	}
	db.First(&media, media.ID)
	if media.ThumbnailURL == "" {
		t.Fatal("legacy image thumbnail was not backfilled")
	}
	firstURL := media.ThumbnailURL
	if err := backfiller.BackfillImageThumbnails(context.Background()); err != nil {
		t.Fatal(err)
	}
	db.First(&media, media.ID)
	if media.ThumbnailURL != firstURL {
		t.Fatal("backfill replaced an existing thumbnail")
	}
}
