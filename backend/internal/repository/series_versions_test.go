package repository

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
)

func seriesVersionFixture(t *testing.T) (*gorm.DB, model.Series, []model.Post) {
	t.Helper()
	db := testutil.Database(t)
	if err := model.AutoMigrate(db); err != nil {
		t.Fatal(err)
	}
	s := model.Series{Name: "version fixture", Slug: "series-version-fixture"}
	if err := db.Create(&s).Error; err != nil {
		t.Fatal(err)
	}
	posts := []model.Post{
		{Title: "kept", Slug: "kept", Content: "original"},
		{Title: "removed", Slug: "removed", Content: "original"},
		{Title: "added", Slug: "added", Content: "original"},
		{Title: "unrelated", Slug: "unrelated", Content: "original"},
	}
	for i := range posts {
		if err := db.Create(&posts[i]).Error; err != nil {
			t.Fatal(err)
		}
	}
	return db, s, posts
}

func seriesPostVersion(t *testing.T, db *gorm.DB, id uuid.UUID) time.Time {
	t.Helper()
	var post model.Post
	if err := db.Select("updated_at").First(&post, id).Error; err != nil {
		t.Fatal(err)
	}
	return post.UpdatedAt
}

func TestSeriesMembershipVersionsTrackAddRemoveReorderAndNoop(t *testing.T) {
	db, s, posts := seriesVersionFixture(t)
	repo := NewSeriesRepo(db)
	if err := repo.SetPosts(s.ID, []uuid.UUID{posts[0].ID, posts[1].ID}); err != nil {
		t.Fatal(err)
	}
	// Future timestamps exercise strict advancement even if the wall clock is
	// behind a saved version, matching the article update contract.
	future := time.Date(2035, 1, 1, 0, 0, 0, 0, time.UTC)
	if err := db.Model(&model.Post{}).Where("id IN ?", []uuid.UUID{posts[0].ID, posts[1].ID, posts[2].ID, posts[3].ID}).UpdateColumn("updated_at", future).Error; err != nil {
		t.Fatal(err)
	}
	if err := repo.SetPosts(s.ID, []uuid.UUID{posts[0].ID, posts[2].ID}); err != nil {
		t.Fatal(err)
	}
	for _, index := range []int{1, 2} {
		if version := seriesPostVersion(t, db, posts[index].ID); !version.After(future) {
			t.Errorf("membership change did not advance post %d version: %s", index, version)
		}
	}
	for _, index := range []int{0, 3} {
		if version := seriesPostVersion(t, db, posts[index].ID); !version.Equal(future) {
			t.Errorf("unchanged post %d version advanced", index)
		}
	}
	addedVersion := seriesPostVersion(t, db, posts[2].ID)
	if err := repo.SetPosts(s.ID, []uuid.UUID{posts[0].ID, posts[2].ID}); err != nil {
		t.Fatal(err)
	}
	if !seriesPostVersion(t, db, posts[0].ID).Equal(future) || !seriesPostVersion(t, db, posts[2].ID).Equal(addedVersion) {
		t.Fatal("same ordered membership must not invalidate editor baselines")
	}
	if err := repo.SetPosts(s.ID, []uuid.UUID{posts[2].ID, posts[0].ID}); err != nil {
		t.Fatal(err)
	}
	if !seriesPostVersion(t, db, posts[0].ID).After(future) || !seriesPostVersion(t, db, posts[2].ID).After(addedVersion) {
		t.Fatal("reordering series members must advance affected versions")
	}
}

func TestSeriesDeleteAdvancesRemovedPostVersions(t *testing.T) {
	db, s, posts := seriesVersionFixture(t)
	repo := NewSeriesRepo(db)
	if err := repo.SetPosts(s.ID, []uuid.UUID{posts[0].ID}); err != nil {
		t.Fatal(err)
	}
	before := seriesPostVersion(t, db, posts[0].ID)
	unrelated := seriesPostVersion(t, db, posts[3].ID)
	if err := repo.Delete(s.ID); err != nil {
		t.Fatal(err)
	}
	if !seriesPostVersion(t, db, posts[0].ID).After(before) {
		t.Fatal("deleting a series did not invalidate its member's baseline")
	}
	if !seriesPostVersion(t, db, posts[3].ID).Equal(unrelated) {
		t.Fatal("series deletion changed an unrelated post")
	}
	var count int64
	if err := db.Model(&model.PostSeries{}).Where("series_id = ?", s.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("series links remain: count %d err %v", count, err)
	}
	if err := repo.Delete(s.ID); err != nil {
		t.Fatalf("repeated delete should remain harmless: %v", err)
	}
}

func TestSeriesInvalidMembershipDoesNotChangeVersionsOrExistingLinks(t *testing.T) {
	db, s, posts := seriesVersionFixture(t)
	repo := NewSeriesRepo(db)
	if err := repo.SetPosts(s.ID, []uuid.UUID{posts[0].ID}); err != nil {
		t.Fatal(err)
	}
	before := seriesPostVersion(t, db, posts[0].ID)
	if err := repo.SetPosts(s.ID, []uuid.UUID{posts[2].ID, uuid.New()}); err == nil {
		t.Fatal("unknown post was accepted")
	}
	if !seriesPostVersion(t, db, posts[0].ID).Equal(before) {
		t.Fatal("failed membership update changed a version")
	}
	var links []model.PostSeries
	if err := db.Where("series_id = ?", s.ID).Find(&links).Error; err != nil || len(links) != 1 || links[0].PostID != posts[0].ID {
		t.Fatalf("failed membership update replaced existing links: %+v %v", links, err)
	}
}

func TestSeriesMembershipLocksPostsBeforeSeriesToAvoidEditorDeadlock(t *testing.T) {
	db, s, posts := seriesVersionFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	db = db.WithContext(ctx)
	editor := db.Begin()
	if editor.Error != nil {
		t.Fatal(editor.Error)
	}
	defer editor.Rollback()
	var locked model.Post
	if err := editor.Clauses(clause.Locking{Strength: "UPDATE"}).First(&locked, posts[0].ID).Error; err != nil {
		t.Fatal(err)
	}
	atPostLock := make(chan struct{}, 1)
	if err := db.Callback().Query().Before("gorm:query").Register("series_test_post_lock", func(tx *gorm.DB) {
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
	defer db.Callback().Query().Remove("series_test_post_lock")
	done := make(chan error, 1)
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		done <- NewSeriesRepo(db).SetPosts(s.ID, []uuid.UUID{posts[0].ID})
	}()
	defer func() {
		cancel()
		select {
		case <-finished:
		case <-time.After(time.Second):
			t.Error("series mutation did not stop after cancellation")
		}
	}()
	select {
	case <-atPostLock:
	case err := <-done:
		t.Fatalf("membership mutation did not wait for the editor's post lock: %v", err)
	case <-ctx.Done():
		t.Fatal("membership mutation did not reach its post lock")
	}
	// The editor already owns P. Its insert needs a key-share lock on S. If
	// SetPosts locked S before waiting for P, this would form a deadlock cycle.
	_, updateErr := NewPostRepo(editor).UpdateWithVersion(posts[0].ID, map[string]interface{}{"content": "editor"}, PostAssociations{SeriesID: &s.ID, SetSeries: true}, false, &locked.UpdatedAt)
	if updateErr != nil {
		cancel()
		t.Fatalf("editor update deadlocked with series mutation: %v", updateErr)
	}
	if err := editor.Commit().Error; err != nil {
		cancel()
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("series mutation failed after editor committed: %v", err)
		}
	case <-ctx.Done():
		t.Fatal("series mutation did not finish after editor committed")
	}
}

func TestSeriesMembershipRechecksMembersAddedBeforeSeriesLock(t *testing.T) {
	db, s, posts := seriesVersionFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	db = db.WithContext(ctx)
	snapshotRead := make(chan struct{})
	resume := make(chan struct{})
	var intercepted atomic.Bool
	if err := db.Callback().Query().After("gorm:query").Register("series_test_membership_snapshot", func(tx *gorm.DB) {
		if tx.Statement.Table == "post_series" && intercepted.CompareAndSwap(false, true) {
			close(snapshotRead)
			select {
			case <-resume:
			case <-ctx.Done():
			}
		}
	}); err != nil {
		t.Fatal(err)
	}
	defer db.Callback().Query().Remove("series_test_membership_snapshot")
	done := make(chan error, 1)
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		done <- NewSeriesRepo(db).SetPosts(s.ID, nil)
	}()
	defer func() {
		cancel()
		select {
		case <-finished:
		case <-time.After(time.Second):
			t.Error("series mutation did not stop after cancellation")
		}
	}()
	select {
	case <-snapshotRead:
	case err := <-done:
		t.Fatalf("membership mutation skipped the affected-post snapshot: %v", err)
	case <-ctx.Done():
		t.Fatal("membership snapshot was not reached")
	}
	// This post was absent from SetPosts' initial membership snapshot. Its
	// committed addition must be detected before removal, locked and versioned.
	saved, err := NewPostRepo(db).UpdateWithVersion(posts[0].ID, map[string]interface{}{"content": "concurrent editor"}, PostAssociations{SeriesID: &s.ID, SetSeries: true}, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	close(resume)
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("membership replacement failed: %v", err)
		}
	case <-ctx.Done():
		t.Fatal("membership replacement did not finish")
	}
	if !seriesPostVersion(t, db, posts[0].ID).After(saved.UpdatedAt) {
		t.Fatal("newly discovered member was removed without invalidating its saved baseline")
	}
	var count int64
	if err := db.Model(&model.PostSeries{}).Where("series_id = ?", s.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("replacement did not clear the membership: count %d err %v", count, err)
	}
}
