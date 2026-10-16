package middleware

import (
	"context"
	"strings"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
	"testing"
	"time"
	"unicode/utf8"
)

func TestAccessQueueNeverBlocksAndDrainsOnClose(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	var written int
	writer := newAccessLogWriter(2, func(ctx context.Context, items []model.AccessLog) error {
		select {
		case entered <- struct{}{}:
		default:
		}
		<-release
		written += len(items)
		return nil
	})
	writer.Enqueue(model.AccessLog{Path: "/one"})
	// Force a flush while the storage layer is unavailable.
	select {
	case <-entered:
	case <-time.After(2 * time.Second):
		t.Fatal("flush never started")
	}
	started := time.Now()
	for i := 0; i < 10; i++ {
		writer.Enqueue(model.AccessLog{Path: "/queued"})
	}
	if time.Since(started) > 100*time.Millisecond {
		t.Fatal("queue blocked request")
	}
	if writer.Dropped() == 0 {
		t.Fatal("overflow was not counted")
	}
	close(release)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := writer.Close(ctx); err != nil {
		t.Fatal(err)
	}
	if written != 3 {
		t.Fatalf("drain wrote %d entries, want 3", written)
	}
	if writer.Enqueue(model.AccessLog{}) {
		t.Fatal("closed queue accepted log")
	}
}

func TestOversizedLogDoesNotPoisonOtherEntriesInBatch(t *testing.T) {
	db := testutil.Database(t, &model.AccessLog{})
	writer := NewAccessLogWriter(db, 8)
	writer.Enqueue(model.AccessLog{IPAddress: "127.0.0.1", Method: "GET", Path: "/normal", CreatedAt: time.Now()})
	writer.Enqueue(model.AccessLog{IPAddress: "127.0.0.1", Method: "GET", Path: "/" + strings.Repeat("中", 2000), UserAgent: strings.Repeat("a", 5000), Referer: strings.Repeat("b", 5000), SessionID: strings.Repeat("c", 5000), QueryParams: strings.Repeat("x", 50000) + "\x00", CreatedAt: time.Now()})
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()
	if err := writer.Close(ctx); err != nil {
		t.Fatal(err)
	}
	var logs []model.AccessLog
	if err := db.Find(&logs).Error; err != nil {
		t.Fatal(err)
	}
	if len(logs) != 2 || writer.Dropped() != 0 {
		t.Fatalf("one bad entry poisoned batch: rows=%d dropped=%d", len(logs), writer.Dropped())
	}
	for _, log := range logs {
		if len(log.UserAgent) > 1000 || len(log.Path) > 1000 || len(log.QueryParams) > 4096 || len(log.SessionID) > 255 || !utf8.ValidString(log.Path) {
			t.Fatal("log is not bounded/UTF-8 safe")
		}
	}
}
