package model

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"tano_blog/backend/internal/testutil"
)

func TestScheduleMigrationOnlyMovesFutureDraftsAndRunsOnce(t *testing.T) {
	db := testutil.Database(t)
	if err := AutoMigrate(db); err != nil {
		t.Fatal(err)
	}
	// Reconstruct an installation whose published_at still doubles as its schedule.
	if db.Migrator().HasColumn(&Post{}, "scheduled_at") {
		if err := db.Migrator().DropColumn(&Post{}, "scheduled_at"); err != nil {
			t.Fatal(err)
		}
	}
	past := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	future := time.Now().Add(24 * time.Hour).Truncate(time.Second)
	ids := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
	for i, tc := range []struct {
		status string
		stamp  time.Time
	}{{"draft", past}, {"draft", future}, {"published", past}} {
		if err := db.Exec("INSERT INTO posts (id,title,slug,content,status,published_at) VALUES (?, ?, ?, '', ?, ?)", ids[i], tc.status, ids[i].String(), tc.status, tc.stamp).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := AutoMigrate(db); err != nil {
		t.Fatal(err)
	}
	var rows []struct {
		ID          uuid.UUID
		PublishedAt *time.Time
		ScheduledAt *time.Time
	}
	if err := db.Model(&Post{}).Select("id,published_at,scheduled_at").Find(&rows).Error; err != nil {
		t.Fatal(err)
	}
	byID := map[uuid.UUID]struct{ published, scheduled *time.Time }{}
	for _, r := range rows {
		byID[r.ID] = struct{ published, scheduled *time.Time }{r.PublishedAt, r.ScheduledAt}
	}
	if r := byID[ids[0]]; r.published == nil || !r.published.Equal(past) || r.scheduled != nil {
		t.Fatalf("past draft publication history changed during upgrade: %+v", r)
	}
	if r := byID[ids[1]]; r.published != nil || r.scheduled == nil || !r.scheduled.Equal(future) {
		t.Fatalf("future draft schedule lost: %+v", r)
	}
	if r := byID[ids[2]]; r.published == nil || !r.published.Equal(past) || r.scheduled != nil {
		t.Fatalf("published date changed: %+v", r)
	}
	if err := db.Model(&Post{}).Where("id = ?", ids[2]).Update("status", "draft").Error; err != nil {
		t.Fatal(err)
	}
	if err := AutoMigrate(db); err != nil {
		t.Fatal(err)
	}
	var withdrawn Post
	if err := db.First(&withdrawn, ids[2]).Error; err != nil {
		t.Fatal(err)
	}
	if withdrawn.PublishedAt == nil || !withdrawn.PublishedAt.Equal(past) {
		t.Fatal("restart erased withdrawn history")
	}
}
