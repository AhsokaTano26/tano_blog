package handler

import (
	"archive/zip"
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/middleware"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/service"
	"tano_blog/backend/internal/testutil"
	"tano_blog/backend/internal/utils"
)

func restoreArchive(t *testing.T, h *BackupHandler, files map[string]string) string {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	data := strings.Replace(emptyBackupJSON(t), `"access_logs":[]`, `"access_logs":[{"path":"backup-data"}]`, 1)
	w, _ := zw.Create("backup/data.json")
	_, _ = w.Write([]byte(data))
	for path, content := range files {
		w, _ = zw.Create("backup/uploads/" + path)
		_, _ = w.Write([]byte(content))
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	name := filepath.Join(h.backupDir, "atomic.zip")
	if err := os.WriteFile(name, buf.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	return name
}

func TestRestoreFileFailurePreservesDatabaseAndUploads(t *testing.T) {
	h := backupTestHandler(t)
	if err := h.db.Exec("INSERT INTO access_logs(path) VALUES ('current-data')").Error; err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(h.uploadDir, "blocked"), []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	restoreArchive(t, h, map[string]string{"blocked/image.png": "new-image"})
	r := gin.New()
	r.POST("/restore", h.RestoreLocal)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("POST", "/restore", strings.NewReader(`{"filename":"atomic.zip"}`)))
	if w.Code < 400 {
		t.Fatalf("file failure reported success: %d %s", w.Code, w.Body)
	}
	var path string
	if err := h.db.Raw("SELECT path FROM access_logs").Scan(&path).Error; err != nil {
		t.Fatal(err)
	}
	if path != "current-data" {
		t.Fatalf("file failure changed database: %s", path)
	}
	data, err := os.ReadFile(filepath.Join(h.uploadDir, "blocked"))
	if err != nil || string(data) != "original" {
		t.Fatalf("original upload changed: %q %v", data, err)
	}
}

func TestRestoreNeverRevivesRevokedSession(t *testing.T) {
	db := testutil.Database(t)
	if err := model.AutoMigrate(db); err != nil {
		t.Fatal(err)
	}
	user := model.User{Username: "restore-admin", Email: "restore@example.test", Role: "admin", PasswordHash: "fixture", TokenVersion: 4, SessionEpoch: "old-epoch"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	h := NewBackupHandler(db, t.TempDir(), t.TempDir())
	name := filepath.Join(h.backupDir, "session.zip")
	if err := h.generateBackup(name, false, false); err != nil {
		t.Fatal(err)
	}
	cfg := &config.JWTConfig{Secret: "restore-regression-secret"}
	token, err := utils.GenerateJWTWithSession(user.ID, user.Username, user.Role, cfg.Secret, time.Hour, 5, user.SessionEpoch)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&user).Update("token_version", 6).Error; err != nil {
		t.Fatal(err)
	}
	r := gin.New()
	r.GET("/admin", middleware.AuthRequired(cfg, db), func(c *gin.Context) { c.Status(http.StatusOK) })
	check := func() int {
		w := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/admin", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		r.ServeHTTP(w, req)
		return w.Code
	}
	if got := check(); got != http.StatusUnauthorized {
		t.Fatalf("revoked fixture: %d", got)
	}
	for _, syncRestore := range []bool{false, true} {
		zr, err := zip.OpenReader(name)
		if err != nil {
			t.Fatal(err)
		}
		if syncRestore {
			err = h.RestoreSyncSnapshotContext(context.Background(), name)
		} else {
			err = h.restoreFromZip(&zr.Reader)
		}
		zr.Close()
		if err != nil {
			t.Fatal(err)
		}
		var current model.User
		if err := db.First(&current, user.ID).Error; err != nil {
			t.Fatal(err)
		}
		if current.SessionEpoch == "" || current.SessionEpoch == user.SessionEpoch {
			t.Fatalf("restored trusted old epoch: %q", current.SessionEpoch)
		}
		if got := check(); got != http.StatusUnauthorized {
			t.Fatalf("restore revived revoked token: %d", got)
		}
		user.SessionEpoch = current.SessionEpoch
	}
}

func TestNewSnapshotRetainsPreviousTransferSource(t *testing.T) {
	h := backupTestHandler(t)
	if err := os.WriteFile(filepath.Join(h.uploadDir, "image.png"), []byte("pinned"), 0600); err != nil {
		t.Fatal(err)
	}
	first, err := h.CreateSyncSnapshot()
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		if _, err := h.CreateSyncSnapshot(); err != nil {
			t.Fatal(err)
		}
	}
	data, err := os.ReadFile(filepath.Join(h.uploadDir, ".sync-snapshots", strings.TrimSuffix(first, ".zip"), "image.png"))
	if err != nil || string(data) != "pinned" {
		t.Fatalf("in-flight transfer lost source: %q %v", data, err)
	}
}

func TestRestoreRejectsUnsafeUploadBeforeMutation(t *testing.T) {
	h := backupTestHandler(t)
	if err := h.db.Exec("INSERT INTO access_logs(path) VALUES ('current-data')").Error; err != nil {
		t.Fatal(err)
	}
	name := restoreArchive(t, h, map[string]string{"../../escape.txt": "unsafe"})
	zr, err := zip.OpenReader(name)
	if err != nil {
		t.Fatal(err)
	}
	defer zr.Close()
	if err := h.restoreFromZip(&zr.Reader); err == nil {
		t.Fatal("unsafe upload accepted")
	}
	var path string
	h.db.Raw("SELECT path FROM access_logs").Scan(&path)
	if path != "current-data" {
		t.Fatalf("unsafe archive changed DB: %s", path)
	}
}

func TestRestoreCommitFailureRollsBackBothResources(t *testing.T) {
	h := backupTestHandler(t)
	if err := h.db.Exec("INSERT INTO access_logs(path) VALUES ('original-db')").Error; err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(h.uploadDir, "image.txt"), []byte("original-file"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := h.db.Exec(`CREATE FUNCTION reject_restore_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.path = 'backup-data' THEN RAISE EXCEPTION 'injected deferred constraint failure'; END IF; RETURN NEW; END $$`).Error; err != nil {
		t.Fatal(err)
	}
	if err := h.db.Exec(`CREATE CONSTRAINT TRIGGER reject_restore_commit AFTER INSERT ON access_logs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_restore_commit()`).Error; err != nil {
		t.Fatal(err)
	}
	name := restoreArchive(t, h, map[string]string{"image.txt": "new-file"})
	zr, err := zip.OpenReader(name)
	if err != nil {
		t.Fatal(err)
	}
	defer zr.Close()
	if err := h.restoreFromZip(&zr.Reader); err == nil {
		t.Fatal("deferred commit failure was swallowed")
	}
	var path string
	h.db.Raw("SELECT path FROM access_logs").Scan(&path)
	data, err := os.ReadFile(filepath.Join(h.uploadDir, "image.txt"))
	if path != "original-db" || string(data) != "original-file" || err != nil {
		t.Fatalf("restore did not roll back DB + files: %s %q %v", path, data, err)
	}
	if err := h.RecoverInterruptedRestore(); err != nil {
		t.Fatal(err)
	}
}

func TestRestoreCrashRecoveryUsesCommittedDatabaseMarker(t *testing.T) {
	for _, state := range []string{"before-swap", "after-first-rename", "uncommitted", "committed", "no-original"} {
		t.Run(state, func(t *testing.T) {
			h := backupTestHandler(t)
			current, old, stage := h.uploadDir, h.uploadDir+".restore-old", h.uploadDir+".restore-stage"
			if err := os.WriteFile(filepath.Join(current, "image.txt"), []byte("old-file"), 0600); err != nil {
				t.Fatal(err)
			}
			if err := os.MkdirAll(stage, 0700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(stage, "image.txt"), []byte("new-file"), 0600); err != nil {
				t.Fatal(err)
			}
			if state == "no-original" {
				if err := os.RemoveAll(current); err != nil {
					t.Fatal(err)
				}
			}
			journal, err := h.prepareRestoreJournal()
			if err != nil {
				t.Fatal(err)
			}
			if state != "before-swap" {
				if state != "no-original" {
					if err := os.Rename(current, old); err != nil {
						t.Fatal(err)
					}
				}
				if state != "after-first-rename" {
					if err := os.Rename(stage, current); err != nil {
						t.Fatal(err)
					}
				}
			}
			if state == "committed" {
				if err := h.db.Create(&model.SiteConfig{Key: restoreTransactionKey, Value: journal.ID, Type: "string"}).Error; err != nil {
					t.Fatal(err)
				}
			}
			if err := h.RecoverInterruptedRestore(); err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(filepath.Join(current, "image.txt"))
			if state == "no-original" {
				if !os.IsNotExist(err) {
					t.Fatalf("uncommitted files survived: %v", err)
				}
			} else {
				want := "old-file"
				if state == "committed" {
					want = "new-file"
				}
				if err != nil || string(data) != want {
					t.Fatalf("recovery state=%s: %q %v", state, data, err)
				}
			}
			if err := h.RecoverInterruptedRestore(); err != nil {
				t.Fatalf("recovery not idempotent: %v", err)
			}
		})
	}
}

func TestSyncSourceGraceStartsWhenRetired(t *testing.T) {
	h := backupTestHandler(t)
	if err := os.WriteFile(filepath.Join(h.uploadDir, "image.txt"), []byte("pinned"), 0600); err != nil {
		t.Fatal(err)
	}
	first, err := h.CreateSyncSnapshot()
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(h.uploadDir, ".sync-snapshots", strings.TrimSuffix(first, ".zip"))
	ancient := time.Now().Add(-14 * 24 * time.Hour)
	if err := os.Chtimes(dir, ancient, ancient); err != nil {
		t.Fatal(err)
	}
	second, err := h.CreateSyncSnapshot()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "image.txt")); err != nil {
		t.Fatalf("old active snapshot lost full retirement grace: %v", err)
	}
	now := time.Now()
	if err := h.retireSyncUploadSources(strings.TrimSuffix(second, ".zip"), now.Add(25*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(dir); err != nil {
		t.Fatalf("source removed during retirement grace: %v", err)
	}
	if err := h.retireSyncUploadSources(strings.TrimSuffix(second, ".zip"), now.Add(49*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("expired source not reclaimed: %v", err)
	}
}

func TestRestoreMigratesOnlyExplicitOrFutureLegacySchedules(t *testing.T) {
	h := backupTestHandler(t)
	if err := h.db.Exec("ALTER TABLE posts ADD COLUMN status text, ADD COLUMN published_at timestamptz, ADD COLUMN scheduled_at timestamptz").Error; err != nil {
		t.Fatal(err)
	}
	past := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)
	future := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)
	posts := `"posts":[{"status":"draft","published_at":"` + past + `"},{"status":"draft","published_at":"` + future + `"},{"status":"draft","published_at":"` + future + `","scheduled_at":null}]`
	data := strings.Replace(emptyBackupJSON(t), `"posts":[]`, posts, 1)
	if err := h.restoreFromZip(backupZip(t, data)); err != nil {
		t.Fatal(err)
	}
	var scheduled, pastDrafts, unscheduledFuture int64
	h.db.Table("posts").Where("scheduled_at IS NOT NULL AND published_at IS NULL").Count(&scheduled)
	h.db.Table("posts").Where("scheduled_at IS NULL AND published_at < NOW()").Count(&pastDrafts)
	h.db.Table("posts").Where("scheduled_at IS NULL AND published_at > NOW()").Count(&unscheduledFuture)
	if scheduled != 1 || pastDrafts != 1 || unscheduledFuture != 1 {
		t.Fatalf("legacy schedule conversion scheduled=%d past=%d unscheduled=%d", scheduled, pastDrafts, unscheduledFuture)
	}
}

func TestRestoreClearsLocalFileDeletionJobs(t *testing.T) {
	h := backupTestHandler(t)
	if err := h.db.AutoMigrate(&model.MediaFileCleanup{}); err != nil {
		t.Fatal(err)
	}
	if err := h.db.Create(&model.MediaFileCleanup{Filename: "restored.png"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := h.restoreFromZip(backupZip(t, emptyBackupJSON(t))); err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := h.db.Model(&model.MediaFileCleanup{}).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("pre-restore deletion jobs can delete restored files")
	}
}

func TestRestoreFinishesFileSwitchAfterClientDisconnectsDuringCommit(t *testing.T) {
	h := backupTestHandler(t)
	if err := os.WriteFile(filepath.Join(h.uploadDir, "image.txt"), []byte("old"), 0600); err != nil {
		t.Fatal(err)
	}
	name := restoreArchive(t, h, map[string]string{"image.txt": "new"})
	zr, err := zip.OpenReader(name)
	if err != nil {
		t.Fatal(err)
	}
	defer zr.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	callback := "test_cancel_on_restore_commit_marker"
	if err := h.db.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
		if cfg, ok := tx.Statement.Dest.(*model.SiteConfig); ok && cfg.Key == restoreTransactionKey {
			cancel()
		}
	}); err != nil {
		t.Fatal(err)
	}
	defer h.db.Callback().Create().Remove(callback)
	if err := h.restoreFromZipContext(ctx, &zr.Reader, nil); err != nil {
		t.Fatalf("finalizing restore abandoned after disconnect: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(h.uploadDir, "image.txt"))
	if err != nil || string(data) != "new" {
		t.Fatalf("finalizing restore files: %q %v", data, err)
	}
	var path string
	h.db.Raw("SELECT path FROM access_logs").Scan(&path)
	if path != "backup-data" {
		t.Fatalf("finalizing restore DB: %s", path)
	}
}

func TestUnresolvedRestoreBlocksNewWritesUntilRecoverySucceeds(t *testing.T) {
	h := backupTestHandler(t)
	replication := service.NewReplicationService(repository.NewSiteConfigRepo(h.db), h.backupDir, h.uploadDir, nil, nil, nil, "")
	replication.SetRestoreRecovery(h.RecoverInterruptedRestoreContext)
	h.SetRestoreRecoveryGuard(replication.RequireRecovery)
	release, err := replication.AcquireBackupGate(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	if err := os.WriteFile(filepath.Join(h.uploadDir, "file"), []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := h.prepareRestoreJournal(); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(h.uploadDir, h.uploadDir+".restore-old"); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(h.uploadDir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(h.uploadDir, "file"), []byte("uncommitted"), 0600); err != nil {
		t.Fatal(err)
	}
	// Real PostgreSQL failure makes the durable commit outcome unavailable.
	if err := h.db.Exec("ALTER TABLE site_configs RENAME TO unavailable_site_configs").Error; err != nil {
		t.Fatal(err)
	}
	if err := h.RecoverInterruptedRestore(); err == nil {
		t.Fatal("unavailable database marker unexpectedly resolved")
	}
	release()
	if unlock, err := replication.AcquireWriteLeaseContext(context.Background()); err == nil {
		unlock()
		t.Fatal("write admitted while restore outcome remains unresolved")
	}
	if unlock, err := replication.AcquireBackupGate(context.Background()); err == nil {
		unlock()
		t.Fatal("backup admitted while restore outcome remains unresolved")
	}
	if err := h.db.Exec("ALTER TABLE unavailable_site_configs RENAME TO site_configs").Error; err != nil {
		t.Fatal(err)
	}
	unlock, err := replication.AcquireWriteLeaseContext(context.Background())
	if err != nil {
		t.Fatalf("writer could not recover after DB returned: %v", err)
	}
	defer unlock()
	data, err := os.ReadFile(filepath.Join(h.uploadDir, "file"))
	if err != nil || string(data) != "original" {
		t.Fatalf("writer admitted before original files recovered: %q %v", data, err)
	}
}

func TestOrdinaryRestoreRechecksStandbyAfterExclusiveGate(t *testing.T) {
	h := backupTestHandler(t)
	repo := repository.NewSiteConfigRepo(h.db)
	if err := repo.Upsert("sync_enabled", "true", "string"); err != nil {
		t.Fatal(err)
	}
	if err := repo.Upsert("sync_role", "primary", "string"); err != nil {
		t.Fatal(err)
	}
	if err := h.db.Exec("INSERT INTO access_logs(path) VALUES ('current-data')").Error; err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(h.uploadDir, "image.txt"), []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	restoreArchive(t, h, map[string]string{"image.txt": "restored"})
	released := false
	h.SetBackupGate(func(context.Context) (func(), error) {
		// Simulate a role change while this request waits for the exclusive gate.
		if err := repo.Upsert("sync_role", "standby", "string"); err != nil {
			t.Fatal(err)
		}
		return func() { released = true }, nil
	})
	r := gin.New()
	r.Use(middleware.StandbyReadOnly(repo, nil))
	r.POST("/api/v1/admin/restore/local", h.RestoreLocal)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("POST", "/api/v1/admin/restore/local", strings.NewReader(`{"filename":"atomic.zip"}`)))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("restore admitted after role changed: status=%d body=%s", w.Code, w.Body)
	}
	if !released {
		t.Fatal("restore retained the exclusive gate")
	}
	var path string
	if err := h.db.Raw("SELECT path FROM access_logs").Scan(&path).Error; err != nil {
		t.Fatal(err)
	}
	if path != "current-data" {
		t.Fatalf("standby restore changed database: %q", path)
	}
	data, err := os.ReadFile(filepath.Join(h.uploadDir, "image.txt"))
	if err != nil || string(data) != "original" {
		t.Fatalf("standby restore changed uploads: %q %v", data, err)
	}
}
