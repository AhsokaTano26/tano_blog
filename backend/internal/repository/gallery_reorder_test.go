package repository

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
)

func TestGalleryReorderCommitsAllChangesAndRollsBackOnDatabaseFailure(t *testing.T) {
	db := testutil.Database(t, &model.GalleryImage{})
	if err := db.Exec("ALTER TABLE gallery_images ADD CONSTRAINT gallery_order_valid CHECK (sort_order>=0)").Error; err != nil {
		t.Fatal(err)
	}
	first := model.GalleryImage{URL: "/first.png", SortOrder: 10}
	second := model.GalleryImage{URL: "/second.png", SortOrder: 20}
	for _, item := range []*model.GalleryImage{&first, &second} {
		if err := db.Create(item).Error; err != nil {
			t.Fatal(err)
		}
	}
	repo := NewGalleryRepo(db)
	if err := repo.Reorder([]ReorderItem{{ID: first.ID, SortOrder: 20}, {ID: second.ID, SortOrder: 10}}); err != nil {
		t.Fatal(err)
	}
	check := func() {
		t.Helper()
		var a, b model.GalleryImage
		if err := db.First(&a, first.ID).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.First(&b, second.ID).Error; err != nil {
			t.Fatal(err)
		}
		if a.SortOrder != 20 || b.SortOrder != 10 {
			t.Fatalf("ordering partially changed: first=%d second=%d", a.SortOrder, b.SortOrder)
		}
	}
	check()
	err := repo.Reorder([]ReorderItem{{ID: first.ID, SortOrder: 30}, {ID: second.ID, SortOrder: -1}})
	var constraintErr *pgconn.PgError
	if !errors.As(err, &constraintErr) || constraintErr.Code != "23514" {
		t.Fatalf("database did not reject invalid second update: %v", err)
	}
	check()
}
