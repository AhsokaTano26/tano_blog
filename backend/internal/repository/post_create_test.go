package repository

import (
	"fmt"
	"testing"

	"github.com/google/uuid"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
)

func TestCreatePostGeneratesUniquePreviewTokens(t *testing.T) {
	db := testutil.Database(t, &model.Post{})
	repo := NewPostRepo(db)
	tokens := make(map[string]bool)
	for i := 0; i < 3; i++ {
		post := model.Post{Title: "新文章", Slug: fmt.Sprint(i), Content: "正文"}
		if err := repo.Create(&post); err != nil {
			t.Fatal(err)
		}
		if _, err := uuid.Parse(post.PreviewToken); err != nil || tokens[post.PreviewToken] {
			t.Fatalf("missing or reused preview token: %q", post.PreviewToken)
		}
		tokens[post.PreviewToken] = true
		var saved model.Post
		if err := db.First(&saved, "id = ?", post.ID).Error; err != nil {
			t.Fatal(err)
		}
		if saved.PreviewToken != post.PreviewToken {
			t.Fatal("generated preview token was not persisted")
		}
	}
}

func TestCreatePostPreservesProvidedPreviewToken(t *testing.T) {
	db := testutil.Database(t, &model.Post{})
	post := model.Post{Title: "import", Slug: "import", Content: "正文", PreviewToken: uuid.NewString()}
	token := post.PreviewToken
	if err := NewPostRepo(db).Create(&post); err != nil {
		t.Fatal(err)
	}
	if post.PreviewToken != token {
		t.Fatal("creating an imported post replaced its preview link")
	}
}
