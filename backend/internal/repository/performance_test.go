package repository

import (
	"context"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
	"testing"
	"time"
)

func TestRequestCancellationDoesNotPoisonSharedRepository(t *testing.T) {
	db := testutil.Database(t, &model.Post{})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	repo := NewPostRepo(db)
	_, _, err := repo.WithContext(ctx).AdminList(1, 10, "")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("request did not cancel: %v", err)
	}
	if _, _, err := repo.AdminList(1, 10, ""); err != nil {
		t.Fatalf("shared repository retained canceled context: %v", err)
	}
}

func TestPostListsExcludeBodiesAndSearchPagesAreComplete(t *testing.T) {
	db := testutil.Database(t, &model.Post{}, &model.Comment{}, &model.Series{}, &model.PostSeries{})
	when := time.Now()
	for i := 0; i < 5; i++ {
		p := model.Post{ID: uuid.New(), Title: fmt.Sprintf("%02d", i), Slug: fmt.Sprint(i), Content: "中文正文 50% \\literal", Status: "published", CreatedAt: when, PreviewToken: uuid.NewString()}
		if err := db.Create(&p).Error; err != nil {
			t.Fatal(err)
		}
	}
	r := NewPostRepo(db)
	for _, term := range []string{"", "中文", "50%", "\\literal"} {
		var titles []string
		for page := 1; page <= 3; page++ {
			items, total, err := r.ListPublic(page, 2, "", "", term)
			if err != nil {
				t.Fatal(err)
			}
			if total != 5 {
				t.Fatalf("search %q total=%d", term, total)
			}
			for _, p := range items {
				if p.Content != "" {
					t.Fatal("list loaded article body")
				}
				titles = append(titles, p.Title)
			}
		}
		if fmt.Sprint(titles) != "[00 01 02 03 04]" {
			t.Fatalf("unstable pagination: %v", titles)
		}
	}
	items, total, err := r.AdminList(1, 2, "")
	if err != nil || total != 5 || len(items) != 2 {
		t.Fatalf("admin list: %d %v", total, err)
	}
	if items[0].Content != "" {
		t.Fatal("admin list loaded article body")
	}
	full, err := r.GetBySlug("0")
	if err != nil || full.Content == "" {
		t.Fatal("detail lost body", err)
	}
}
