package model_test

import (
	"errors"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
)

func TestPreviewTokenUniquenessOnFreshDatabase(t *testing.T) {
	db := testutil.Database(t, &model.Post{})
	if err := model.AutoMigrate(db); err != nil {
		t.Fatal(err)
	}
	assertPreviewTokenRules(t, db)
}

func TestPreviewTokenMigrationPreservesExistingLinks(t *testing.T) {
	db := testutil.Database(t, &model.Post{})
	for _, sql := range []string{
		"DROP INDEX IF EXISTS idx_posts_preview_token_active",
		"CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_preview_token ON posts (preview_token)",
	} {
		if err := db.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}
	posts := []model.Post{
		{Title: "existing without preview", Slug: "existing-empty", Content: "正文"},
		{Title: "existing preview", Slug: "existing-link", Content: "保留的正文", PreviewToken: "existing-preview-link"},
	}
	if err := db.Create(&posts).Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := model.AutoMigrate(db); err != nil {
			t.Fatalf("migration run %d: %v", i, err)
		}
	}
	var existing model.Post
	if err := db.First(&existing, "id = ?", posts[1].ID).Error; err != nil {
		t.Fatal(err)
	}
	if existing.PreviewToken != posts[1].PreviewToken || existing.Content != posts[1].Content {
		t.Fatal("migration changed an existing article or preview link")
	}
	assertPreviewTokenRules(t, db)
}

func assertPreviewTokenRules(t *testing.T, db *gorm.DB) {
	t.Helper()
	// Includes batch inserts used by backup restoration, not only single creates.
	posts := make([]model.Post, 3)
	for i := range posts {
		posts[i] = model.Post{Title: "新文章", Slug: fmt.Sprintf("new-%d", i), Content: "日本語と中文", Status: "published"}
	}
	if err := db.Create(&posts).Error; err != nil {
		t.Fatalf("articles without preview links must coexist: %v", err)
	}
	if err := db.Model(&posts[0]).Update("preview_token", "unique-preview").Error; err != nil {
		t.Fatal(err)
	}
	err := db.Model(&posts[1]).Update("preview_token", "unique-preview").Error
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		t.Fatalf("duplicate nonempty preview token must remain forbidden: %v", err)
	}
	if err := db.Model(&posts[0]).Update("preview_token", "").Error; err != nil {
		t.Fatalf("clearing a preview token must remain possible: %v", err)
	}
}
