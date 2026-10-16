package repository

import (
	"fmt"
	"github.com/google/uuid"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
	"testing"
)

func TestCollectionsPageWithoutLoadingBodiesOrLosingReplies(t *testing.T) {
	db := testutil.Database(t, &model.Post{}, &model.Series{}, &model.PostSeries{}, &model.Comment{}, &model.CommentReaction{}, &model.Media{}, &model.GalleryImage{})
	post := model.Post{Title: "published", Slug: "published", Status: "published", Content: "private large body", PreviewToken: uuid.NewString()}
	if err := db.Create(&post).Error; err != nil {
		t.Fatal(err)
	}
	series := model.Series{Name: "series", Slug: "series"}
	if err := db.Create(&series).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.PostSeries{SeriesID: series.ID, PostID: post.ID}).Error; err != nil {
		t.Fatal(err)
	}
	s, total, err := NewSeriesRepo(db).GetBySlugPage("series", 1, 1)
	if err != nil || total != 1 || len(s.Posts) != 1 || s.Posts[0].Content != "" {
		t.Fatalf("series projection: %+v %d %v", s, total, err)
	}
	root := model.Comment{PostID: post.ID, Content: "root", Nickname: "a", Status: "approved"}
	db.Create(&root)
	for i := 0; i < 23; i++ {
		db.Create(&model.Comment{PostID: post.ID, ParentID: &root.ID, Content: fmt.Sprint(i), Nickname: "a", Status: "approved"})
	}
	r := NewCommentRepo(db)
	roots, total, err := r.ListByPostPage(post.ID, "oldest", nil, 1, 20)
	if err != nil || total != 1 || len(roots) != 1 || len(roots[0].Children) != 10 || roots[0].ChildrenTotal != 23 {
		t.Fatalf("bounded root replies: %+v %d %v", roots, total, err)
	}
	ids := map[uuid.UUID]bool{}
	for page := 1; page <= 3; page++ {
		replies, total, err := r.ListByPostPage(post.ID, "oldest", &root.ID, page, 10)
		if err != nil || total != 23 {
			t.Fatal(total, err)
		}
		for _, c := range replies {
			if ids[c.ID] {
				t.Fatal("repeated reply")
			}
			ids[c.ID] = true
		}
	}
	if len(ids) != 23 {
		t.Fatalf("lost replies: %d", len(ids))
	}
	for i := 0; i < 5; i++ {
		db.Create(&model.GalleryImage{URL: fmt.Sprintf("/%d.png", i), SortOrder: i})
	}
	items, total, err := NewGalleryRepo(db).ListPage(2, 2)
	if err != nil || total != 5 || len(items) != 2 || items[0].URL != "/2.png" {
		t.Fatal(items, total, err)
	}
}
