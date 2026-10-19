package repository

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tano_blog/backend/internal/model"
)

func TestPostDeleteLocksArticleBeforeAssociationsToAvoidEditorDeadlock(t *testing.T) {
	db, s, posts := seriesVersionFixture(t)
	if err := NewSeriesRepo(db).SetPosts(s.ID, []uuid.UUID{posts[0].ID}); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	db = db.WithContext(ctx)
	editor := db.Begin()
	if editor.Error != nil {
		t.Fatal(editor.Error)
	}
	defer editor.Rollback()
	var current model.Post
	if err := editor.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, posts[0].ID).Error; err != nil {
		t.Fatal(err)
	}
	atPostLock := make(chan struct{}, 1)
	if err := db.Callback().Query().Before("gorm:query").Register("delete_test_post_lock", func(tx *gorm.DB) {
		if tx.Statement.Table == "posts" {
			if _, ok := tx.Statement.Clauses["FOR"]; ok {
				select {
				case atPostLock <- struct{}{}:
				default:
				}
			}
		}
	}); err != nil {
		t.Fatal(err)
	}
	defer db.Callback().Query().Remove("delete_test_post_lock")
	done := make(chan error, 1)
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		done <- NewPostRepo(db).Delete(posts[0].ID)
	}()
	defer func() {
		cancel()
		select {
		case <-finished:
		case <-time.After(time.Second):
			t.Error("post deletion did not stop after cancellation")
		}
	}()
	select {
	case <-atPostLock:
	case err := <-done:
		t.Fatalf("deletion did not wait for the editor's article lock: %v", err)
	case <-ctx.Done():
		t.Fatal("deletion touched associations before acquiring its article lock")
	}
	// Delete must not already own the association rows while waiting for P.
	// This editor save deletes/reinserts the series join under its existing P lock.
	_, err := NewPostRepo(editor).UpdateWithVersion(posts[0].ID, map[string]interface{}{"content": "saved before deletion"}, PostAssociations{SeriesID: &s.ID, SetSeries: true}, true, &current.UpdatedAt)
	if err != nil {
		t.Fatalf("editor was blocked by deletion's association locks: %v", err)
	}
	if err := editor.Commit().Error; err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("deletion failed after editor commit: %v", err)
		}
	case <-ctx.Done():
		t.Fatal("deletion did not finish after editor commit")
	}
	for _, table := range []string{"posts", "post_series", "post_revisions"} {
		var count int64
		column := "post_id"
		if table == "posts" {
			column = "id"
		}
		if err := db.Table(table).Where(column+" = ?", posts[0].ID).Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("deletion left rows in %s: count %d err %v", table, count, err)
		}
	}
	if err := NewPostRepo(db).Delete(posts[0].ID); err != nil {
		t.Fatalf("repeated deletion must remain harmless: %v", err)
	}
}
