package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"tano_blog/backend/internal/middleware"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/service"
)

const clearAllPath = "/api/v1/admin/restore/clear-all"

func clearRequest(ctx context.Context) *http.Request {
	req := httptest.NewRequest(http.MethodPost, clearAllPath, strings.NewReader(`{"confirm":"CLEAR_ALL"}`)).WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	return req
}

func clearFixture(t *testing.T) *BackupHandler {
	t.Helper()
	h := backupTestHandler(t)
	if err := h.db.Exec("INSERT INTO access_logs(path) VALUES ('original-data')").Error; err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(h.uploadDir, "original.txt"), []byte("original-upload"), 0600); err != nil {
		t.Fatal(err)
	}
	return h
}

func assertClearPreserved(t *testing.T, h *BackupHandler) {
	t.Helper()
	var path string
	if err := h.db.Raw("SELECT path FROM access_logs").Scan(&path).Error; err != nil || path != "original-data" {
		t.Errorf("clear failure changed database: path=%q err=%v", path, err)
	}
	data, err := os.ReadFile(filepath.Join(h.uploadDir, "original.txt"))
	if err != nil || string(data) != "original-upload" {
		t.Errorf("clear failure changed uploads: %q err=%v", data, err)
	}
}

func clearRouter(h *BackupHandler) *gin.Engine {
	r := gin.New()
	r.POST(clearAllPath, h.ClearAllData)
	return r
}

func TestClearAllDataHoldsExclusiveGateAgainstUpload(t *testing.T) {
	h := clearFixture(t)
	replication := &service.ReplicationService{}
	h.SetBackupGate(replication.AcquireBackupGate)
	truncating, continueClear := make(chan struct{}), make(chan struct{})
	var once sync.Once
	var unblock sync.Once
	releaseClear := func() { unblock.Do(func() { close(continueClear) }) }
	defer releaseClear()
	callback := "test_clear_exclusive_truncate"
	if err := h.db.Callback().Raw().Before("gorm:raw").Register(callback, func(tx *gorm.DB) {
		if strings.HasPrefix(tx.Statement.SQL.String(), "TRUNCATE TABLE") {
			once.Do(func() { close(truncating); <-continueClear })
		}
	}); err != nil {
		t.Fatal(err)
	}
	defer h.db.Callback().Raw().Remove(callback)
	uploadAttempt, uploaded := make(chan struct{}), make(chan struct{})
	r := gin.New()
	r.Use(middleware.StandbyReadOnly(repository.NewSiteConfigRepo(h.db), nil, func(ctx context.Context) (func(), error) {
		if ctx.Value(clearUploadContextKey{}) != nil {
			close(uploadAttempt)
		}
		return replication.AcquireWriteLeaseContext(ctx)
	}))
	r.POST(clearAllPath, h.ClearAllData)
	r.POST("/api/v1/admin/upload", func(c *gin.Context) { close(uploaded); c.Status(http.StatusNoContent) })
	clearDone := make(chan int, 1)
	go func() {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, clearRequest(context.Background()))
		clearDone <- w.Code
	}()
	select {
	case <-truncating:
	case <-time.After(2 * time.Second):
		t.Fatal("clear did not enter its database transaction")
	}
	uploadDone := make(chan int, 1)
	go func() {
		w := httptest.NewRecorder()
		ctx := context.WithValue(context.Background(), clearUploadContextKey{}, true)
		r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/admin/upload", nil).WithContext(ctx))
		uploadDone <- w.Code
	}()
	<-uploadAttempt
	select {
	case <-uploaded:
		t.Error("upload entered while clear-all still held its database/filesystem operation")
	case <-time.After(100 * time.Millisecond):
	}
	releaseClear()
	for name, done := range map[string]<-chan int{"clear": clearDone, "upload": uploadDone} {
		select {
		case status := <-done:
			if status >= 400 {
				t.Errorf("%s status=%d", name, status)
			}
		case <-time.After(2 * time.Second):
			t.Errorf("%s did not finish after gate release", name)
		}
	}
}

type clearUploadContextKey struct{}

func TestClearAllDataRechecksRoleInsideGate(t *testing.T) {
	h := clearFixture(t)
	repo := repository.NewSiteConfigRepo(h.db)
	if err := repo.Upsert("sync_enabled", "true", "string"); err != nil {
		t.Fatal(err)
	}
	if err := repo.Upsert("sync_role", "primary", "string"); err != nil {
		t.Fatal(err)
	}
	released := false
	h.SetBackupGate(func(context.Context) (func(), error) {
		if err := repo.Upsert("sync_role", "standby", "string"); err != nil {
			t.Fatal(err)
		}
		return func() { released = true }, nil
	})
	w := httptest.NewRecorder()
	clearRouter(h).ServeHTTP(w, clearRequest(context.Background()))
	if w.Code != http.StatusServiceUnavailable || !released {
		t.Errorf("clear did not reject changed role/release gate: %d released=%v %s", w.Code, released, w.Body)
	}
	assertClearPreserved(t, h)
}

func TestClearAllDataCancelledGateWaitPreservesData(t *testing.T) {
	h := clearFixture(t)
	replication := &service.ReplicationService{}
	release, err := replication.AcquireWriteLeaseContext(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	h.SetBackupGate(replication.AcquireBackupGate)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	w := httptest.NewRecorder()
	clearRouter(h).ServeHTTP(w, clearRequest(ctx))
	if w.Code != http.StatusRequestTimeout {
		t.Errorf("cancelled clear status=%d %s", w.Code, w.Body)
	}
	assertClearPreserved(t, h)
}

func TestClearAllDataRejectsUnreadableUploadTreeBeforeTruncation(t *testing.T) {
	h := clearFixture(t)
	if err := os.RemoveAll(h.uploadDir); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(h.uploadDir, []byte("upload-path-is-a-file"), 0600); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	clearRouter(h).ServeHTTP(w, clearRequest(context.Background()))
	if w.Code != http.StatusInternalServerError {
		t.Errorf("unreadable upload tree reported success: %d %s", w.Code, w.Body)
	}
	var path string
	if err := h.db.Raw("SELECT path FROM access_logs").Scan(&path).Error; err != nil || path != "original-data" {
		t.Errorf("unreadable files still committed database clear: path=%q err=%v", path, err)
	}
	data, err := os.ReadFile(h.uploadDir)
	if err != nil || string(data) != "upload-path-is-a-file" {
		t.Errorf("failed staging lost original path: %q %v", data, err)
	}
}

func TestClearAllDataCommitFailureRestoresDatabaseAndFiles(t *testing.T) {
	h := clearFixture(t)
	if err := h.db.Exec(`CREATE FUNCTION reject_clear_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.key = 'internal_restore_transaction' THEN RAISE EXCEPTION 'injected clear commit failure'; END IF; RETURN NEW; END $$`).Error; err != nil {
		t.Fatal(err)
	}
	if err := h.db.Exec(`CREATE CONSTRAINT TRIGGER reject_clear_commit AFTER INSERT OR UPDATE ON site_configs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_clear_commit()`).Error; err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	clearRouter(h).ServeHTTP(w, clearRequest(context.Background()))
	if w.Code != http.StatusInternalServerError {
		t.Errorf("commit failure reported success: %d %s", w.Code, w.Body)
	}
	assertClearPreserved(t, h)
	if err := h.RecoverInterruptedRestore(); err != nil {
		t.Errorf("clear failure could not recover: %v", err)
	}
}

func TestClearAllDataRenameFailureRestoresDatabaseAndFiles(t *testing.T) {
	h := clearFixture(t)
	callback := "test_clear_missing_stage"
	if err := h.db.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
		if cfg, ok := tx.Statement.Dest.(*model.SiteConfig); ok && cfg.Key == restoreTransactionKey {
			if err := os.RemoveAll(h.uploadDir + ".restore-stage"); err != nil {
				t.Error(err)
			}
		}
	}); err != nil {
		t.Fatal(err)
	}
	defer h.db.Callback().Create().Remove(callback)
	w := httptest.NewRecorder()
	clearRouter(h).ServeHTTP(w, clearRequest(context.Background()))
	if w.Code != http.StatusInternalServerError {
		t.Errorf("rename failure reported success: %d %s", w.Code, w.Body)
	}
	assertClearPreserved(t, h)
}

func TestClearAllDataCancellationBeforeCommitPreservesData(t *testing.T) {
	h := clearFixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	callback := "test_clear_cancel_before_truncate"
	if err := h.db.Callback().Raw().Before("gorm:raw").Register(callback, func(tx *gorm.DB) {
		if strings.HasPrefix(tx.Statement.SQL.String(), "TRUNCATE TABLE") {
			cancel()
		}
	}); err != nil {
		t.Fatal(err)
	}
	defer h.db.Callback().Raw().Remove(callback)
	w := httptest.NewRecorder()
	clearRouter(h).ServeHTTP(w, clearRequest(ctx))
	if w.Code != http.StatusRequestTimeout {
		t.Errorf("cancelled transaction status=%d %s", w.Code, w.Body)
	}
	assertClearPreserved(t, h)
}

func TestClearAllDataPreservesAccountsSettingsBackupsAndSnapshots(t *testing.T) {
	h := clearFixture(t)
	if err := h.db.Exec("INSERT INTO users DEFAULT VALUES").Error; err != nil {
		t.Fatal(err)
	}
	if err := repository.NewSiteConfigRepo(h.db).Upsert("site_name", "keep-settings", "string"); err != nil {
		t.Fatal(err)
	}
	snapshot := filepath.Join(h.uploadDir, ".sync-snapshots", "frozen", "image.txt")
	if err := os.MkdirAll(filepath.Dir(snapshot), 0700); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{snapshot, filepath.Join(h.backupDir, "keep.zip")} {
		if err := os.WriteFile(path, []byte("keep"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for attempt := 0; attempt < 2; attempt++ {
		w := httptest.NewRecorder()
		clearRouter(h).ServeHTTP(w, clearRequest(context.Background()))
		if w.Code != http.StatusOK {
			t.Fatalf("clear attempt=%d status=%d %s", attempt, w.Code, w.Body)
		}
	}
	var users, logs int64
	h.db.Table("users").Count(&users)
	h.db.Table("access_logs").Count(&logs)
	if users != 1 || logs != 0 {
		t.Errorf("clear retained incorrect data: users=%d logs=%d", users, logs)
	}
	setting, err := repository.NewSiteConfigRepo(h.db).Get("site_name")
	if err != nil || setting != "keep-settings" {
		t.Errorf("clear lost settings: %+v err=%v", setting, err)
	}
	for _, path := range []string{snapshot, filepath.Join(h.backupDir, "keep.zip")} {
		if data, err := os.ReadFile(path); err != nil || string(data) != "keep" {
			t.Errorf("clear lost preserved file %s: %q %v", path, data, err)
		}
	}
	if _, err := os.Stat(filepath.Join(h.uploadDir, "original.txt")); !os.IsNotExist(err) {
		t.Errorf("clear retained ordinary upload: %v", err)
	}
}

func TestClearAllDataUnresolvedCommitBlocksWritersUntilRecovery(t *testing.T) {
	h := clearFixture(t)
	replication := service.NewReplicationService(repository.NewSiteConfigRepo(h.db), h.backupDir, h.uploadDir, nil, nil, nil, "")
	replication.SetRestoreRecovery(h.RecoverInterruptedRestoreContext)
	h.SetRestoreRecoveryGuard(replication.RequireRecovery)
	h.SetBackupGate(replication.AcquireBackupGate)
	callback := "test_clear_unavailable_commit_marker"
	if err := h.db.Callback().Create().After("gorm:create").Register(callback, func(tx *gorm.DB) {
		if cfg, ok := tx.Statement.Dest.(*model.SiteConfig); ok && cfg.Key == restoreTransactionKey && tx.Error == nil {
			// Make the committed outcome temporarily unavailable to the independent
			// recovery query, using a real PostgreSQL catalog change.
			_, err := tx.Statement.ConnPool.ExecContext(tx.Statement.Context, "ALTER TABLE site_configs RENAME TO unavailable_site_configs")
			tx.AddError(err)
		}
	}); err != nil {
		t.Fatal(err)
	}
	defer h.db.Callback().Create().Remove(callback)
	if err := h.clearAllDataContext(context.Background()); err == nil {
		t.Fatal("unresolved clear outcome reported success")
	} else {
		t.Logf("unresolved clear error: %v", err)
	}
	if _, err := os.Stat(h.uploadDir + ".restore-journal.json"); err != nil {
		t.Fatalf("unresolved clear lost its recovery journal: %v", err)
	}
	if release, err := replication.AcquireWriteLeaseContext(context.Background()); err == nil {
		release()
		t.Error("writer entered before clear commit outcome was recoverable")
	}
	if err := h.db.Exec("ALTER TABLE unavailable_site_configs RENAME TO site_configs").Error; err != nil {
		t.Fatal(err)
	}
	release, err := replication.AcquireWriteLeaseContext(context.Background())
	if err != nil {
		t.Fatalf("writer could not recover committed clear: %v", err)
	}
	defer release()
	var logs int64
	if err := h.db.Table("access_logs").Count(&logs).Error; err != nil || logs != 0 {
		t.Errorf("recovered committed database: rows=%d err=%v", logs, err)
	}
	if _, err := os.Stat(filepath.Join(h.uploadDir, "original.txt")); !os.IsNotExist(err) {
		t.Errorf("recovered committed uploads retained deleted file: %v", err)
	}
}

func TestRestoreRecoveryWaitsForPendingDatabaseOutcome(t *testing.T) {
	h := clearFixture(t)
	stage := h.uploadDir + ".restore-stage"
	if err := os.Mkdir(stage, 0700); err != nil {
		t.Fatal(err)
	}
	journal, err := h.prepareRestoreJournal()
	if err != nil {
		t.Fatal(err)
	}
	tx := h.db.Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	defer tx.Rollback()
	if err := tx.Exec("TRUNCATE TABLE access_logs").Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.Create(&model.SiteConfig{Key: restoreTransactionKey, Value: journal.ID, Type: "string"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(h.uploadDir, h.uploadDir+".restore-old"); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(stage, h.uploadDir); err != nil {
		t.Fatal(err)
	}
	started := make(chan struct{})
	var once sync.Once
	callback := "test_pending_commit_recovery_started"
	if err := h.db.Callback().Raw().Before("gorm:raw").Register(callback, func(tx *gorm.DB) {
		if strings.HasPrefix(tx.Statement.SQL.String(), "LOCK TABLE site_configs") {
			once.Do(func() { close(started) })
		}
	}); err != nil {
		t.Fatal(err)
	}
	defer h.db.Callback().Raw().Remove(callback)
	if err := h.db.Callback().Query().Before("gorm:query").Register(callback, func(tx *gorm.DB) {
		if tx.Statement.Table == "site_configs" {
			once.Do(func() { close(started) })
		}
	}); err != nil {
		t.Fatal(err)
	}
	defer h.db.Callback().Query().Remove(callback)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- h.RecoverInterruptedRestoreContext(ctx) }()
	select {
	case <-started:
	case <-ctx.Done():
		t.Fatal("recovery never attempted to read the database outcome")
	}
	completed := false
	select {
	case err := <-done:
		completed = true
		t.Errorf("recovery selected an uncommitted database outcome: %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	if err := tx.Commit().Error; err != nil {
		t.Fatal(err)
	}
	if !completed {
		select {
		case err := <-done:
			if err != nil {
				t.Errorf("committed outcome recovery failed: %v", err)
			}
		case <-ctx.Done():
			t.Error("recovery did not finish after database commit")
		}
	}
	if _, err := os.Stat(filepath.Join(h.uploadDir, "original.txt")); !os.IsNotExist(err) {
		t.Errorf("recovery revived files from before a committed clear: %v", err)
	}
}

func TestClearAllDataFinishesAfterCancellationAtCommit(t *testing.T) {
	h := clearFixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	finalizing := false
	callback := "test_clear_cancel_at_marker"
	if err := h.db.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
		if cfg, ok := tx.Statement.Dest.(*model.SiteConfig); ok && cfg.Key == restoreTransactionKey {
			finalizing = true
			cancel()
		}
	}); err != nil {
		t.Fatal(err)
	}
	defer h.db.Callback().Create().Remove(callback)
	w := httptest.NewRecorder()
	clearRouter(h).ServeHTTP(w, clearRequest(ctx))
	if w.Code != http.StatusOK {
		t.Fatalf("clear abandoned irreversible commit after cancellation: %d %s", w.Code, w.Body)
	}
	if !finalizing {
		t.Error("clear did not persist its recoverable finalization marker")
	}
	var logs int64
	if err := h.db.Table("access_logs").Count(&logs).Error; err != nil || logs != 0 {
		t.Errorf("finalizing clear database: rows=%d err=%v", logs, err)
	}
	if _, err := os.Stat(filepath.Join(h.uploadDir, "original.txt")); !os.IsNotExist(err) {
		t.Errorf("finalizing clear did not finish files: %v", err)
	}
}
