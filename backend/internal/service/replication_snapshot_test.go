package service

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/testutil"
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

func TestWriteLeaseStopsWaitingAfterCancellation(t *testing.T) {
	service := &ReplicationService{}
	release, err := service.AcquireBackupGate(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		unlock, err := service.AcquireWriteLeaseContext(ctx)
		if unlock != nil {
			unlock()
		}
		done <- err
	}()
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("cancelled writer: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("writer remained blocked after cancellation")
	}
}

func TestInterruptedSyncUsesDatabaseStateToResolveFiles(t *testing.T) {
	for _, state := range []string{"pending", "pending-empty", "db-applied"} {
		t.Run(state, func(t *testing.T) {
			db := testutil.Database(t, &model.SiteConfig{})
			repo := repository.NewSiteConfigRepo(db)
			root := t.TempDir()
			current := filepath.Join(root, "uploads")
			old := current + ".sync-old"
			if err := os.MkdirAll(current, 0700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(current, "file"), []byte("new"), 0600); err != nil {
				t.Fatal(err)
			}
			if state != "pending-empty" {
				if err := os.MkdirAll(old, 0700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(old, "file"), []byte("old"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			if err := repo.Upsert(syncApplyStateKey, state, "string"); err != nil {
				t.Fatal(err)
			}
			replication := NewReplicationService(repo, root, current, nil, nil, nil, "")
			if err := replication.RecoverInterruptedApply(); err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(filepath.Join(current, "file"))
			if state == "pending-empty" {
				if !os.IsNotExist(err) {
					t.Fatalf("uncommitted uploads survived: %q %v", data, err)
				}
			} else {
				want := "old"
				if state == "db-applied" {
					want = "new"
				}
				if string(data) != want || err != nil {
					t.Fatalf("recovery returned %q %v", data, err)
				}
			}
			if err := replication.RecoverInterruptedApply(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
