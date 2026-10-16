package service

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSnapshotReleasesWritersAfterCapture(t *testing.T) {
	service := &ReplicationService{}
	released := make(chan struct{})
	service.SetSnapshotCreator(func(ctx context.Context, release func()) (string, error) {
		release()
		release()
		go func() { unlock := service.AcquireWriteLease(); defer unlock(); close(released) }()
		select {
		case <-released:
			return "snapshot.zip", nil
		case <-time.After(time.Second):
			t.Error("writer remained blocked during export")
			return "", context.DeadlineExceeded
		}
	})
	if _, err := service.createPrimarySnapshot(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestSnapshotFailureReleasesWriters(t *testing.T) {
	service := &ReplicationService{}
	service.SetSnapshotCreator(func(context.Context, func()) (string, error) { return "", context.Canceled })
	if _, err := service.createPrimarySnapshot(context.Background()); err == nil {
		t.Fatal("failure was swallowed")
	}
	if !service.writeGate.TryLock() {
		t.Fatal("failed snapshot retained write gate")
	}
	service.writeGate.Unlock()
}

func TestSnapshotUploadDirectorySupportsLegacyAndPinnedFiles(t *testing.T) {
	for _, tc := range []struct {
		name, marker, want string
		fail               bool
	}{
		{"legacy", "", "/data/uploads", false},
		{"pinned", "sync-2026", "/data/uploads/.sync-snapshots/sync-2026", false},
		{"traversal", "../private", "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			name := filepath.Join(t.TempDir(), "sync-2026.zip")
			f, err := os.Create(name)
			if err != nil {
				t.Fatal(err)
			}
			zw := zip.NewWriter(f)
			if tc.marker != "" {
				w, _ := zw.Create("backup/snapshot-uploads.json")
				json.NewEncoder(w).Encode(map[string]string{"directory": tc.marker})
			}
			zw.Close()
			f.Close()
			dir, err := snapshotUploadDirectory(name, "/data/uploads")
			if (err != nil) != tc.fail || dir != tc.want {
				t.Fatalf("got %q, %v", dir, err)
			}
		})
	}
}

func TestBackupGateCancellationWhileWriterIsActive(t *testing.T) {
	service := &ReplicationService{}
	releaseWrite := service.AcquireWriteLease()
	defer releaseWrite()
	ctx, cancel := context.WithCancel(context.Background())
	started := make(chan struct{})
	done := make(chan error, 1)
	go func() {
		close(started)
		release, err := service.AcquireBackupGate(ctx)
		if release != nil {
			release()
		}
		done <- err
	}()
	<-started
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("gate wait returned %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("cancelled gate wait remained blocked")
	}
}
