package handler

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/service"
	"tano_blog/backend/internal/testutil"
	"testing"
	"time"
)

func backupTestHandler(t *testing.T) *BackupHandler {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_DSN")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_DSN for backup integration tests")
	}
	root, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	pool, _ := root.DB()
	t.Cleanup(func() { pool.Close() })
	schema := "backup_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if err := root.Exec("CREATE SCHEMA " + schema).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { root.Exec("DROP SCHEMA " + schema + " CASCADE") })
	parsed, _ := url.Parse(dsn)
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	db, err := gorm.Open(postgres.Open(parsed.String()), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	connections, _ := db.DB()
	t.Cleanup(func() { connections.Close() })
	for _, table := range backupTables {
		cols := "id uuid PRIMARY KEY DEFAULT gen_random_uuid()"
		switch table {
		case "users":
			cols += ", token_version bigint DEFAULT 0, reset_token text DEFAULT ''"
		case "access_logs":
			cols += ", path text, response_time bigint"
		case "site_configs":
			cols += ", key text UNIQUE, value text, type text, created_at timestamptz, updated_at timestamptz"
		case "passkeys":
			cols += ", credential_id text, public_key bytea, sign_count bigint"
		}
		if err := db.Exec("CREATE TABLE " + table + " (" + cols + ")").Error; err != nil {
			t.Fatal(err)
		}
	}
	return NewBackupHandler(db, t.TempDir(), t.TempDir())
}
func backupZip(t *testing.T, data string) *zip.Reader {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, _ := zw.Create("backup/data.json")
	_, _ = w.Write([]byte(data))
	_ = zw.Close()
	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatal(err)
	}
	return zr
}
func emptyBackupJSON(t *testing.T) string {
	t.Helper()
	data := backupData{Version: "1.1", Data: map[string][]map[string]interface{}{}}
	for _, table := range backupTables {
		data.Data[table] = []map[string]interface{}{}
	}
	raw, _ := json.Marshal(data)
	return string(raw)
}
func TestRestoreRejectsDuplicateTablesBeforeMutation(t *testing.T) {
	h := backupTestHandler(t)
	h.db.Exec("INSERT INTO users DEFAULT VALUES")
	data := strings.Replace(emptyBackupJSON(t), `"users":[]`, `"users":[],"users":[]`, 1)
	if err := h.restoreFromZip(backupZip(t, data)); err == nil {
		t.Fatal("ambiguous duplicate table was accepted")
	}
	var count int64
	h.db.Table("users").Count(&count)
	if count != 1 {
		t.Fatal("validation failure modified existing data")
	}
}
func TestBackupRoundTripPreservesLargeIntegersAndBinary(t *testing.T) {
	h := backupTestHandler(t)
	h.db.Exec("INSERT INTO users (token_version, reset_token) VALUES (3, 'old-token')")
	h.db.Exec("INSERT INTO access_logs(path,response_time) VALUES ('test',9007199254740993)")
	h.db.Exec("INSERT INTO passkeys(credential_id,public_key,sign_count) VALUES ('key',decode('00ff01','hex'),7)")
	name := filepath.Join(h.backupDir, "roundtrip.zip")
	if err := h.generateBackup(name, false, false); err != nil {
		t.Fatal(err)
	}
	zr, err := zip.OpenReader(name)
	if err != nil {
		t.Fatal(err)
	}
	defer zr.Close()
	if err := h.restoreFromZip(&zr.Reader); err != nil {
		t.Fatal(err)
	}
	var number int64
	h.db.Raw("SELECT response_time FROM access_logs").Scan(&number)
	if number != 9007199254740993 {
		t.Fatalf("integer precision lost: %d", number)
	}
	var key []byte
	if err := h.db.Raw("SELECT public_key FROM passkeys").Row().Scan(&key); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(key, []byte{0, 255, 1}) {
		t.Fatalf("binary changed: %x", key)
	}
	var version int
	h.db.Raw("SELECT token_version FROM users").Scan(&version)
	if version != 4 {
		t.Fatalf("sessions were not invalidated: %d", version)
	}
}
func TestBackupLargeJSONRoundTrip(t *testing.T) {
	if os.Getenv("TEST_LARGE_BACKUP") == "" {
		t.Skip("set TEST_LARGE_BACKUP=1 for >256 MiB JSON roundtrip")
	}
	h := backupTestHandler(t)
	if err := h.db.Exec("INSERT INTO access_logs(path,response_time) SELECT repeat('x',10000),i FROM generate_series(1,28000) i").Error; err != nil {
		t.Fatal(err)
	}
	runtime.GC()
	stop := make(chan struct{})
	peakResult := make(chan uint64)
	go func() {
		ticker := time.NewTicker(5 * time.Millisecond)
		defer ticker.Stop()
		var peak uint64
		for {
			select {
			case <-stop:
				peakResult <- peak
				return
			case <-ticker.C:
				var memory runtime.MemStats
				runtime.ReadMemStats(&memory)
				if memory.HeapAlloc > peak {
					peak = memory.HeapAlloc
				}
			}
		}
	}()
	defer func() {
		close(stop)
		peak := <-peakResult
		t.Logf("observed peak Go heap during export/restore: %.1f MiB", float64(peak)/(1024*1024))
	}()
	name := filepath.Join(h.backupDir, "large.zip")
	if err := h.generateBackup(name, false, false); err != nil {
		t.Fatal(err)
	}
	zr, err := zip.OpenReader(name)
	if err != nil {
		t.Fatal(err)
	}
	defer zr.Close()
	var dataSize uint64
	for _, entry := range zr.File {
		if filepath.Base(entry.Name) == "data.json" {
			dataSize = entry.UncompressedSize64
		}
	}
	if dataSize <= 256*1024*1024 {
		t.Fatalf("fixture did not exceed old limit: %d", dataSize)
	}
	t.Logf("JSON size: %.1f MiB", float64(dataSize)/(1024*1024))
	if err := h.restoreFromZip(&zr.Reader); err != nil {
		t.Fatal(err)
	}
	var count int64
	h.db.Table("access_logs").Count(&count)
	if count != 28000 {
		t.Fatalf("restored %d rows", count)
	}
}

func TestBackupCancellationRemovesPartialArchive(t *testing.T) {
	h := backupTestHandler(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	name := filepath.Join(h.backupDir, "cancelled.zip")
	if err := h.generateBackupContext(ctx, name, false, false, nil); !errors.Is(err, context.Canceled) {
		t.Fatalf("got %v", err)
	}
	if _, err := os.Stat(name); !os.IsNotExist(err) {
		t.Fatalf("partial archive remains: %v", err)
	}
}
func TestSyncSnapshotPinsRowsAndUploadsBeforeReleasingWrites(t *testing.T) {
	h := backupTestHandler(t)
	if err := h.db.Exec("INSERT INTO access_logs(path,response_time) VALUES ('before',1)").Error; err != nil {
		t.Fatal(err)
	}
	upload := filepath.Join(h.uploadDir, "sample.txt")
	if err := os.WriteFile(upload, []byte("before"), 0644); err != nil {
		t.Fatal(err)
	}
	released := false
	name, err := h.CreateSyncSnapshotContext(context.Background(), func() {
		released = true
		if err := h.db.Exec("UPDATE access_logs SET path='after'").Error; err != nil {
			t.Fatal(err)
		}
		if err := os.Remove(upload); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(upload, []byte("after"), 0644); err != nil {
			t.Fatal(err)
		}
	})
	if err != nil {
		t.Fatal(err)
	}
	if !released {
		t.Fatal("write gate was not released")
	}
	snapshotPath := filepath.Join(h.backupDir, "sync", name)
	frozen := filepath.Join(h.uploadDir, ".sync-snapshots", strings.TrimSuffix(name, ".zip"))
	if err := h.VerifySyncSnapshotUploads(snapshotPath, frozen); err != nil {
		t.Fatal(err)
	}
	zr, err := zip.OpenReader(snapshotPath)
	if err != nil {
		t.Fatal(err)
	}
	defer zr.Close()
	if err := h.restoreFromZip(&zr.Reader); err != nil {
		t.Fatal(err)
	}
	var path string
	h.db.Raw("SELECT path FROM access_logs").Scan(&path)
	if path != "before" {
		t.Fatalf("snapshot changed after release: %s", path)
	}
	content, err := os.ReadFile(filepath.Join(frozen, "sample.txt"))
	if err != nil || string(content) != "before" {
		t.Fatalf("snapshot uploads changed: %q %v", content, err)
	}
}
func TestRestoreFailureRollsBackEarlierBatches(t *testing.T) {
	h := backupTestHandler(t)
	h.db.Exec("INSERT INTO users (token_version) VALUES (8)")
	data := strings.Replace(emptyBackupJSON(t), `"access_logs":[]`, `"access_logs":[{"path":"valid"},{"response_time":"invalid-bigint"}]`, 1)
	if err := h.restoreFromZip(backupZip(t, data)); err == nil {
		t.Fatal("invalid row accepted")
	}
	var version int
	h.db.Raw("SELECT token_version FROM users").Scan(&version)
	if version != 8 {
		t.Fatalf("restore did not roll back: %d", version)
	}
}
func TestBackupStatusCancellation(t *testing.T) {
	h := NewBackupHandler(nil, t.TempDir(), t.TempDir())
	ctx, done, ok := h.beginOperation(context.Background(), "export")
	if !ok {
		t.Fatal("could not start")
	}
	if _, _, ok := h.beginOperation(context.Background(), "restore"); ok {
		t.Fatal("overlapping operation allowed")
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	h.CancelBackup(c)
	if recorder.Code != http.StatusAccepted || !errors.Is(ctx.Err(), context.Canceled) {
		t.Fatalf("cancel: %d, %v", recorder.Code, ctx.Err())
	}
	done(ctx.Err())
	recorder = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(recorder)
	h.BackupStatus(c)
	var status struct {
		Running bool
		Phase   string
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &status); err != nil {
		t.Fatal(err)
	}
	if status.Running || status.Phase != "cancelled" {
		t.Fatalf("status: %+v", status)
	}
}

// A blocked PostgreSQL query must be cancelled by the HTTP control endpoint,
// and the partial archive must never appear in the list of completed backups.
func TestCancelBackupInterruptsBlockedQuery(t *testing.T) {
	h := backupTestHandler(t)
	blocker := h.db.Begin()
	if blocker.Error != nil {
		t.Fatal(blocker.Error)
	}
	defer blocker.Rollback()
	if err := blocker.Exec("LOCK TABLE access_logs IN ACCESS EXCLUSIVE MODE").Error; err != nil {
		t.Fatal(err)
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/admin/backups", nil)
	done := make(chan struct{})
	go func() { defer close(done); h.CreateBackup(c) }()
	deadline := time.After(3 * time.Second)
	for {
		h.operationMu.Lock()
		table := h.operation.Table
		h.operationMu.Unlock()
		if table == "access_logs" {
			break
		}
		select {
		case <-deadline:
			t.Fatal("backup did not reach blocked query")
		case <-time.After(10 * time.Millisecond):
		}
	}
	cancelRecorder := httptest.NewRecorder()
	cancelContext, _ := gin.CreateTestContext(cancelRecorder)
	h.CancelBackup(cancelContext)
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("cancel did not interrupt query")
	}
	if recorder.Code != http.StatusConflict {
		t.Fatalf("cancel response: %d %s", recorder.Code, recorder.Body.String())
	}
	files, err := os.ReadDir(h.backupDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 0 {
		t.Fatalf("partial backup remains: %v", files)
	}
	h.operationMu.Lock()
	status := h.operation
	h.operationMu.Unlock()
	if status.Running || status.Phase != "cancelled" {
		t.Fatalf("status: %+v", status)
	}
}

func TestRestoreCancellationRollsBackInsertedBatch(t *testing.T) {
	h := backupTestHandler(t)
	if err := h.db.Exec("INSERT INTO users(token_version) VALUES (8)").Error; err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	h.db.Callback().Create().After("gorm:create").Register("cancel_restore", func(tx *gorm.DB) {
		if tx.Statement.Table == "access_logs" {
			cancel()
		}
	})
	data := strings.Replace(emptyBackupJSON(t), `"access_logs":[]`, `"access_logs":[{"path":"new"}]`, 1)
	if err := h.restoreFromZipContext(ctx, backupZip(t, data), nil); err == nil {
		t.Fatal("cancelled restore was committed")
	}
	var version int
	if err := h.db.Raw("SELECT token_version FROM users").Scan(&version).Error; err != nil {
		t.Fatal(err)
	}
	if version != 8 {
		t.Fatalf("restore failed to roll back: %d", version)
	}
}

func TestRestoreUploadReplacementPreservesPinnedInode(t *testing.T) {
	h := backupTestHandler(t)
	path := filepath.Join(h.uploadDir, "file.txt")
	if err := os.WriteFile(path, []byte("before"), 0644); err != nil {
		t.Fatal(err)
	}
	frozen, err := h.freezeUploads(context.Background(), "sync-test")
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	entry, _ := zw.Create("backup/uploads/file.txt")
	entry.Write([]byte("after"))
	zw.Close()
	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatal(err)
	}
	if failures := h.extractUploads(zr); len(failures) != 0 {
		t.Fatal(failures)
	}
	previous, err := os.ReadFile(filepath.Join(frozen, "file.txt"))
	if err != nil || string(previous) != "before" {
		t.Fatalf("snapshot inode was overwritten: %q, %v", previous, err)
	}
	current, err := os.ReadFile(path)
	if err != nil || string(current) != "after" {
		t.Fatalf("restored file: %q, %v", current, err)
	}
}

func TestSyncRestorePreservesLocalSecretsAndApplyState(t *testing.T) {
	h := backupTestHandler(t)
	if err := h.db.Exec("INSERT INTO site_configs(key,value,type) VALUES ('sync_ssh_private_key_enc','original-secret','string'),('sync_apply_state','pending','string'),('site_title','original-title','string')").Error; err != nil {
		t.Fatal(err)
	}
	name := filepath.Join(h.backupDir, "legacy-snapshot.zip")
	if err := h.generateBackup(name, false, false); err != nil {
		t.Fatal(err)
	}
	if err := h.db.Exec("UPDATE site_configs SET value='local-secret' WHERE key='sync_ssh_private_key_enc'").Error; err != nil {
		t.Fatal(err)
	}
	if err := h.db.Exec("UPDATE site_configs SET value='new-title' WHERE key='site_title'").Error; err != nil {
		t.Fatal(err)
	}
	if err := h.RestoreSyncSnapshotContext(context.Background(), name); err != nil {
		t.Fatal(err)
	}
	var secret, title, state string
	h.db.Raw("SELECT value FROM site_configs WHERE key='sync_ssh_private_key_enc'").Scan(&secret)
	h.db.Raw("SELECT value FROM site_configs WHERE key='site_title'").Scan(&title)
	h.db.Raw("SELECT value FROM site_configs WHERE key='sync_apply_state'").Scan(&state)
	if secret != "local-secret" || title != "original-title" || state != "db-applied" {
		t.Fatalf("secret=%q title=%q state=%q", secret, title, state)
	}
}

func TestRestoreLegacyPasskeysWithoutCredentialAreSkipped(t *testing.T) {
	h := backupTestHandler(t)
	data := strings.Replace(emptyBackupJSON(t), `"version":"1.1"`, `"version":"1.0"`, 1)
	data = strings.Replace(data, `"passkeys":[]`, `"passkeys":[{"sign_count":7}]`, 1)
	if err := h.restoreFromZip(backupZip(t, data)); err != nil {
		t.Fatal(err)
	}
	var count int64
	h.db.Table("passkeys").Count(&count)
	if count != 0 {
		t.Fatal("unusable legacy credential was restored")
	}
}

func TestRestoreCannotBeCancelledAfterCommit(t *testing.T) {
	h := backupTestHandler(t)
	ctx, finish, ok := h.beginOperation(context.Background(), "restore")
	if !ok {
		t.Fatal("start")
	}
	defer finish(nil)
	if err := h.restoreFromZipContext(ctx, backupZip(t, emptyBackupJSON(t)), nil); err != nil {
		t.Fatal(err)
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	h.CancelBackup(c)
	if recorder.Code != http.StatusConflict || ctx.Err() != nil {
		t.Fatalf("committed restore was cancelled: %d %v", recorder.Code, ctx.Err())
	}
}

func TestOrdinaryBackupPinsMediaBeforeWritesResume(t *testing.T) {
	h := backupTestHandler(t)
	if err := h.db.Exec("ALTER TABLE media ADD COLUMN url text").Error; err != nil {
		t.Fatal(err)
	}
	if err := h.db.Exec("INSERT INTO media(url) VALUES ('/uploads/photo.txt')").Error; err != nil {
		t.Fatal(err)
	}
	original := filepath.Join(h.uploadDir, "photo.txt")
	if err := os.WriteFile(original, []byte("original bytes"), 0644); err != nil {
		t.Fatal(err)
	}
	name := filepath.Join(h.backupDir, "ordinary.zip")
	err := h.generateBackupContext(context.Background(), name, true, false, func() {
		if err := h.db.Exec("DELETE FROM media").Error; err != nil {
			t.Fatal(err)
		}
		if err := os.Remove(original); err != nil {
			t.Fatal(err)
		}
	})
	if err != nil {
		t.Fatal(err)
	}
	archive, err := zip.OpenReader(name)
	if err != nil {
		t.Fatal(err)
	}
	defer archive.Close()
	found := false
	for _, entry := range archive.File {
		if strings.HasSuffix(entry.Name, "/uploads/photo.txt") {
			rc, err := entry.Open()
			if err != nil {
				t.Fatal(err)
			}
			contents, err := io.ReadAll(rc)
			rc.Close()
			if err != nil || string(contents) != "original bytes" {
				t.Fatalf("backup bytes: %q %v", contents, err)
			}
			found = true
		}
	}
	if !found {
		t.Fatal("ordinary backup lost an upload deleted after snapshot capture")
	}
	if err := h.restoreFromZip(&archive.Reader); err != nil {
		t.Fatal(err)
	}
	var url string
	h.db.Raw("SELECT url FROM media").Scan(&url)
	if url != "/uploads/photo.txt" {
		t.Fatalf("database changed after capture: %q", url)
	}
	entries, err := os.ReadDir(filepath.Join(h.uploadDir, ".sync-snapshots"))
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("ordinary snapshot files were retained: %v", entries)
	}
}

func TestRestoreCommentsWhoseParentAppearsAfterEarlierBatches(t *testing.T) {
	db := testutil.Database(t)
	if err := model.AutoMigrate(db); err != nil {
		t.Fatal(err)
	}
	h := NewBackupHandler(db, t.TempDir(), t.TempDir())
	post := model.Post{Title: "comment batch test", Slug: "comment-batch-test", Content: "post content"}
	if err := db.Create(&post).Error; err != nil {
		t.Fatal(err)
	}
	parent := model.Comment{PostID: post.ID, Nickname: "parent", Content: strings.Repeat("parent ", 180)}
	if err := db.Create(&parent).Error; err != nil {
		t.Fatal(err)
	}
	children := make([]model.Comment, 250)
	for i := range children {
		children[i] = model.Comment{PostID: post.ID, ParentID: &parent.ID, Nickname: "child", Content: strings.Repeat("child ", 200)}
	}
	if err := db.Create(&children).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&parent).Update("content", strings.Repeat("updated parent ", 120)).Error; err != nil {
		t.Fatal(err)
	}
	var beforeParent int64
	if err := db.Raw("SELECT count(*) FROM comments WHERE ctid < (SELECT ctid FROM comments WHERE id=?)", parent.ID).Scan(&beforeParent).Error; err != nil {
		t.Fatal(err)
	}
	if beforeParent < 200 {
		t.Fatalf("fixture did not move parent behind first batch: %d", beforeParent)
	}
	name := filepath.Join(h.backupDir, "comments.zip")
	if err := h.generateBackup(name, false, false); err != nil {
		t.Fatal(err)
	}
	archive, err := zip.OpenReader(name)
	if err != nil {
		t.Fatal(err)
	}
	defer archive.Close()
	if err := h.restoreFromZip(&archive.Reader); err != nil {
		t.Fatal(err)
	}
	var restoredChildren int64
	db.Model(&model.Comment{}).Where("parent_id=?", parent.ID).Count(&restoredChildren)
	if restoredChildren != 250 {
		t.Fatalf("restored %d child relationships", restoredChildren)
	}
}

func TestCreateBackupCoordinatesCaptureWithBusinessWrites(t *testing.T) {
	h := backupTestHandler(t)
	if err := h.db.Exec("ALTER TABLE media ADD COLUMN url text").Error; err != nil {
		t.Fatal(err)
	}
	replication := &service.ReplicationService{}
	releaseBusinessWrite := replication.AcquireWriteLease()
	waiting := make(chan struct{})
	h.SetBackupGate(func(ctx context.Context) (func(), error) {
		close(waiting)
		release, err := replication.AcquireBackupGate(ctx)
		if err != nil {
			return nil, err
		}
		return func() {
			release()
			releaseDelete := replication.AcquireWriteLease()
			defer releaseDelete()
			if err := h.db.Exec("DELETE FROM media").Error; err != nil {
				t.Error(err)
			}
			if err := os.Remove(filepath.Join(h.uploadDir, "file.txt")); err != nil {
				t.Error(err)
			}
		}, nil
	})
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/admin/backups", nil)
	done := make(chan struct{})
	go func() { defer close(done); h.CreateBackup(c) }()
	select {
	case <-waiting:
	case <-time.After(time.Second):
		releaseBusinessWrite()
		t.Fatal("backup bypassed capture gate")
	}
	if err := h.db.Exec("INSERT INTO media(url) VALUES ('/uploads/file.txt')").Error; err != nil {
		releaseBusinessWrite()
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(h.uploadDir, "file.txt"), []byte("completed upload"), 0644); err != nil {
		releaseBusinessWrite()
		t.Fatal(err)
	}
	releaseBusinessWrite()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("backup held write gate during export")
	}
	if recorder.Code != http.StatusCreated {
		t.Fatalf("create failed: %d %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Filename string `json:"filename"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	archive, err := zip.OpenReader(filepath.Join(h.backupDir, response.Filename))
	if err != nil {
		t.Fatal(err)
	}
	defer archive.Close()
	found := false
	for _, entry := range archive.File {
		if strings.HasSuffix(entry.Name, "/uploads/file.txt") {
			found = true
		}
	}
	if !found {
		t.Fatal("archive omitted the captured upload")
	}
	if err := h.restoreFromZip(&archive.Reader); err != nil {
		t.Fatal(err)
	}
	var count int64
	h.db.Table("media").Where("url=?", "/uploads/file.txt").Count(&count)
	if count != 1 {
		t.Fatal("backup did not capture the finished business write")
	}
}

func TestRestoreInvalidCommentParentRollsBackWholeTransaction(t *testing.T) {
	db := testutil.Database(t)
	if err := model.AutoMigrate(db); err != nil {
		t.Fatal(err)
	}
	h := NewBackupHandler(db, t.TempDir(), t.TempDir())
	originalPost := model.Post{Title: "keep post", Slug: "keep-post", Content: "original"}
	if err := db.Create(&originalPost).Error; err != nil {
		t.Fatal(err)
	}
	originalComment := model.Comment{PostID: originalPost.ID, Nickname: "keep", Content: "original comment"}
	if err := db.Create(&originalComment).Error; err != nil {
		t.Fatal(err)
	}
	var data backupData
	if err := json.Unmarshal([]byte(emptyBackupJSON(t)), &data); err != nil {
		t.Fatal(err)
	}
	newPost := uuid.NewString()
	data.Data["posts"] = []map[string]interface{}{{"id": newPost, "title": "new", "slug": "new", "content": "new"}}
	data.Data["comments"] = []map[string]interface{}{{"id": uuid.NewString(), "post_id": newPost, "parent_id": uuid.NewString(), "nickname": "new", "content": "invalid parent"}}
	raw, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	restoreErr := h.restoreFromZip(backupZip(t, string(raw)))
	var constraintErr *pgconn.PgError
	if !errors.As(restoreErr, &constraintErr) || constraintErr.Code != "23503" || constraintErr.ConstraintName != "fk_comments_children" {
		t.Fatalf("missing parent did not trigger the comments foreign key: %v", restoreErr)
	}
	var count int64
	db.Model(&model.Comment{}).Where("id=? AND content=?", originalComment.ID, "original comment").Count(&count)
	if count != 1 {
		t.Fatal("invalid parent did not roll back original comment")
	}
	db.Model(&model.Post{}).Where("id=?", originalPost.ID).Count(&count)
	if count != 1 {
		t.Fatal("invalid parent did not roll back original post")
	}
}
