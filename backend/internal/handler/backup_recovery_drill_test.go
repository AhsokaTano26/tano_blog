package handler

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
)

// TestRecoveryDrill uses two disposable schemas and temporary directories. It
// exercises the same archive creation and local restore handlers as the admin UI;
// it never reads DB_DSN, UPLOAD_DIR, BACKUP_DIR or production backup archives.
func TestRecoveryDrill(t *testing.T) {
	sourceDB := testutil.Database(t)
	targetDB := testutil.Database(t)
	sourceSchema, targetSchema := drillSchema(t, sourceDB), drillSchema(t, targetDB)
	if sourceSchema == targetSchema {
		t.Fatal("recovery source and destination must use distinct disposable schemas")
	}
	for _, db := range []*gorm.DB{sourceDB, targetDB} {
		if err := model.AutoMigrate(db); err != nil {
			t.Fatal(err)
		}
	}
	source := NewBackupHandler(sourceDB, t.TempDir(), t.TempDir())
	target := NewBackupHandler(targetDB, t.TempDir(), t.TempDir())

	author := model.User{Username: "drill-author", Email: "drill@example.invalid", PasswordHash: "fixture-only", TokenVersion: 7}
	category := model.Category{Name: "Recovery", Slug: "recovery"}
	tag := model.Tag{Name: "Drill", Slug: "drill"}
	for _, value := range []any{&author, &category, &tag} {
		if err := sourceDB.Create(value).Error; err != nil {
			t.Fatal(err)
		}
	}
	post := model.Post{Title: "Recovery fixture", Slug: "recovery-fixture", Content: "A recoverable post with UTF-8: 恢复演练。", Status: "published", AuthorID: &author.ID, CategoryID: &category.ID}
	if err := sourceDB.Create(&post).Error; err != nil {
		t.Fatal(err)
	}
	if err := sourceDB.Create(&model.PostTag{PostID: post.ID, TagID: tag.ID}).Error; err != nil {
		t.Fatal(err)
	}
	mediaBytes := bytes.Repeat([]byte{0, 255, 17, 128, 42, 10}, 11000)
	thumbnailBytes := []byte("recovery thumbnail fixture\x00\xff")
	files := map[string][]byte{"drill/original.bin": mediaBytes, "drill/thumbnail.bin": thumbnailBytes}
	for name, data := range files {
		drillWriteFile(t, source.uploadDir, name, data)
	}
	media := model.Media{Filename: "drill/original.bin", OriginalName: "original.bin", MimeType: "application/octet-stream", Size: int64(len(mediaBytes)), URL: "/uploads/drill/original.bin", ThumbnailURL: "/uploads/drill/thumbnail.bin", UploadedBy: author.ID}
	if err := sourceDB.Create(&media).Error; err != nil {
		t.Fatal(err)
	}

	create := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(create)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/admin/backups", nil)
	source.CreateBackup(c)
	if create.Code != http.StatusCreated {
		t.Fatalf("backup creation failed: %d %s", create.Code, create.Body.String())
	}
	var created struct {
		Filename string `json:"filename"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &created); err != nil || created.Filename == "" {
		t.Fatalf("backup response is unusable: %v", err)
	}
	archivePath := filepath.Join(source.backupDir, created.Filename)
	archive, err := zip.OpenReader(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range archive.File {
		if entry.FileInfo().IsDir() {
			continue
		}
		reader, err := entry.Open()
		if err != nil {
			t.Fatal(err)
		}
		_, copyErr := io.Copy(io.Discard, reader) // Full read validates ZIP CRCs.
		closeErr := reader.Close()
		if copyErr != nil || closeErr != nil {
			t.Fatalf("archive integrity failure: read %v close %v", copyErr, closeErr)
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	archiveBytes, err := os.ReadFile(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	drillWriteFile(t, target.backupDir, created.Filename, archiveBytes)

	// The destination starts with conflicting content and a damaged original;
	// the thumbnail is absent. Restore must replace both database and media.
	if err := targetDB.Create(&model.Post{Title: "damaged", Slug: "recovery-fixture", Content: "wrong"}).Error; err != nil {
		t.Fatal(err)
	}
	drillWriteFile(t, target.uploadDir, "drill/original.bin", []byte("damaged"))
	restore := httptest.NewRecorder()
	c, _ = gin.CreateTestContext(restore)
	body, _ := json.Marshal(map[string]string{"filename": created.Filename})
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/admin/restore/local", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	target.RestoreLocal(c)
	if restore.Code != http.StatusOK {
		t.Fatalf("restore failed: %d %s", restore.Code, restore.Body.String())
	}
	var restored model.Post
	if err := targetDB.Preload("Author").Preload("Category").Preload("Tags").First(&restored, "id = ?", post.ID).Error; err != nil {
		t.Fatal(err)
	}
	if restored.Content != post.Content || restored.Title != post.Title || restored.Author == nil || restored.Author.Username != author.Username || restored.Category == nil || restored.Category.Slug != category.Slug || len(restored.Tags) != 1 || restored.Tags[0].ID != tag.ID {
		t.Fatalf("restored post or relational integrity differs: %+v", restored)
	}
	if restored.Author.TokenVersion != 8 {
		t.Fatalf("restore must invalidate backed-up sessions: %d", restored.Author.TokenVersion)
	}
	var restoredMedia model.Media
	if err := targetDB.First(&restoredMedia, "id = ?", media.ID).Error; err != nil {
		t.Fatal(err)
	}
	if restoredMedia.URL != media.URL || restoredMedia.ThumbnailURL != media.ThumbnailURL || restoredMedia.Size != media.Size || restoredMedia.UploadedBy != author.ID {
		t.Fatalf("media metadata changed during restore: %+v", restoredMedia)
	}
	var count int64
	if err := targetDB.Model(&model.Post{}).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("destination database was not replaced: count %d err %v", count, err)
	}
	for name, expected := range files {
		for _, dir := range []string{source.uploadDir, target.uploadDir} {
			actual, err := os.ReadFile(filepath.Join(dir, name))
			if err != nil || sha256.Sum256(actual) != sha256.Sum256(expected) {
				t.Fatalf("media checksum mismatch for %s: %v", name, err)
			}
		}
	}
	var sourceAuthor model.User
	if err := sourceDB.First(&sourceAuthor, "id = ?", author.ID).Error; err != nil || sourceAuthor.TokenVersion != 7 {
		t.Fatalf("restore unexpectedly mutated the source schema: version %d err %v", sourceAuthor.TokenVersion, err)
	}
	t.Log("Recovery drill passed: independent schemas, database relationships, session invalidation, archive CRCs and original/thumbnail SHA-256 checksums")
}

func drillSchema(t *testing.T, db *gorm.DB) string {
	t.Helper()
	var schema string
	if err := db.Raw("SELECT current_schema()").Scan(&schema).Error; err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(schema, "perf_test_") {
		t.Fatalf("refusing recovery drill outside a testutil schema: %q", schema)
	}
	return schema
}

func drillWriteFile(t *testing.T, root, name string, data []byte) {
	t.Helper()
	path := filepath.Join(root, name)
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
}
