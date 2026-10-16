package handler

import (
	"archive/zip"
	"bufio"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/utils"
)

var errRestoreStandby = errors.New("备服务器为只读模式，请在主服务器执行恢复操作")

var restoreSafeColumns = map[string][]string{
	"users":             {"id", "username", "email", "password_hash", "display_name", "avatar_url", "bio", "totp_secret", "totp_enabled", "reset_token", "token_version", "session_epoch", "role", "must_change_password", "created_at", "updated_at"},
	"categories":        {"id", "name", "slug", "description", "sort_order", "created_at", "updated_at"},
	"tags":              {"id", "name", "slug", "sort_order", "created_at"},
	"media_tags":        {"id", "name", "created_at"},
	"site_configs":      {"id", "key", "value", "type", "created_at", "updated_at"},
	"posts":             {"id", "title", "slug", "content", "excerpt", "cover_image", "status", "is_top", "allow_comment", "author_name", "author_id", "editor_id", "category_id", "view_count", "published_at", "scheduled_at", "preview_token", "password_hash", "password_hint", "created_at", "updated_at"},
	"post_tags":         {"post_id", "tag_id"},
	"comments":          {"id", "post_id", "parent_id", "nickname", "email", "website", "content", "status", "ip_address", "user_agent", "country", "city", "fingerprint", "edited_count", "edited_at", "updated_at", "created_at"},
	"media":             {"id", "filename", "original_name", "mime_type", "size", "url", "thumbnail_url", "alt_text", "title", "artist", "album", "description", "uploaded_by", "created_at"},
	"media_tag_links":   {"media_id", "media_tag_id"},
	"passkeys":          {"id", "user_id", "credential_id", "public_key", "credential_data", "sign_count", "aaguid", "nickname", "created_at"},
	"post_revisions":    {"id", "post_id", "title", "content", "excerpt", "editor_id", "created_at"},
	"access_logs":       {"id", "path", "method", "ip_address", "user_agent", "status_code", "response_time", "referer", "query_params", "device_type", "browser", "os", "country", "city", "user_id", "session_id", "created_at"},
	"series":            {"id", "name", "slug", "description", "cover_image", "sort_order", "created_at", "updated_at"},
	"post_series":       {"series_id", "post_id", "sort_order"},
	"comment_reactions": {"id", "comment_id", "emoji", "ip_address", "created_at"},
	"comment_revisions": {"id", "comment_id", "content", "edited_at"},
	"post_reactions":    {"id", "post_id", "emoji", "ip_address", "created_at"},
	"friend_links":      {"id", "name", "url", "description", "avatar", "email", "status", "sort_order", "created_at", "updated_at"},
	"gallery_images":    {"id", "url", "title", "description", "width", "height", "sort_order", "created_at", "updated_at"},
	"nav_links":         {"id", "title", "url", "sort_order", "created_at", "updated_at"},
	"ip_bans":           {"id", "ip_address", "scope", "reason", "auto_ban", "expires_at", "created_by", "created_at"},
	"notifications":     {"id", "user_id", "type", "title", "content", "link", "is_read", "created_at"},
}

type BackupHandler struct {
	db                *gorm.DB
	uploadDir         string
	backupDir         string
	operationMu       sync.Mutex
	operation         BackupProgress
	cancelOperation   context.CancelFunc
	acquireBackupGate func(context.Context) (func(), error)
	requireRecovery   func()
}

func NewBackupHandler(db *gorm.DB, uploadDir, backupDir string) *BackupHandler {
	uploadDir, _ = filepath.Abs(uploadDir)
	h := &BackupHandler{db: db, uploadDir: uploadDir, backupDir: backupDir}
	os.MkdirAll(backupDir, 0755)
	return h
}

// SetBackupGate is configured at startup to coordinate ordinary backups with
// the same business-write gate used by replication snapshots.
func (h *BackupHandler) SetBackupGate(acquire func(context.Context) (func(), error)) {
	h.acquireBackupGate = acquire
}

// SetRestoreRecoveryGuard blocks future writers if a file/DB outcome cannot be
// resolved before this restore releases its exclusive gate.
func (h *BackupHandler) SetRestoreRecoveryGuard(require func()) { h.requireRecovery = require }

// backupData is the serializable backup format for all tables
type backupData struct {
	Version   string                              `json:"version"`
	CreatedAt string                              `json:"created_at"`
	Data      map[string][]map[string]interface{} `json:"data"`
}

type syncUploadFile struct {
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

// backupTables ordered by dependency (parents first)
var backupTables = []string{
	"users", "categories", "tags", "media_tags", "series", "site_configs",
	"posts", "post_tags", "post_series", "comments", "comment_reactions", "comment_revisions",
	"post_reactions", "media", "media_tag_links",
	"passkeys", "post_revisions", "access_logs",
	"friend_links", "gallery_images", "nav_links", "ip_bans", "notifications",
}

// truncateOrder drops children first to avoid FK violations
var truncateOrder = []string{
	"gallery_images", "notifications", "ip_bans", "nav_links", "friend_links",
	"access_logs", "post_revisions", "passkeys", "media_tag_links", "media",
	"post_reactions", "comment_revisions", "comment_reactions", "comments",
	"post_series", "post_tags", "posts", "site_configs", "series", "media_tags", "tags", "categories", "users",
}

const (
	maxRestoreArchiveSize  = int64(500 * 1024 * 1024)
	maxRestoreExpandedSize = uint64(2 * 1024 * 1024 * 1024)
	maxRestoreEntrySize    = uint64(500 * 1024 * 1024)
	maxRestoreDataJSONSize = int64(maxRestoreExpandedSize)
	maxRestoreManifestSize = int64(64 * 1024 * 1024)
	restoreBatchSize       = 200
)

// BackupProgress describes the one active backup or restore operation. Rows are
// cumulative within a phase; bytes are ZIP output bytes or validated JSON bytes.
type BackupProgress struct {
	Running bool   `json:"running"`
	Phase   string `json:"phase"`
	Table   string `json:"table"`
	Rows    int64  `json:"rows"`
	Bytes   int64  `json:"bytes"`
	Error   string `json:"error,omitempty"`
}

func (h *BackupHandler) beginOperation(parent context.Context, phase string) (context.Context, func(error), bool) {
	h.operationMu.Lock()
	defer h.operationMu.Unlock()
	if h.operation.Running {
		return nil, nil, false
	}
	ctx, cancel := context.WithCancel(parent)
	h.cancelOperation = cancel
	h.operation = BackupProgress{Running: true, Phase: phase}
	return ctx, func(err error) {
		cancel()
		h.operationMu.Lock()
		defer h.operationMu.Unlock()
		h.operation.Running = false
		h.cancelOperation = nil
		h.operation.Table = ""
		h.operation.Phase = "completed"
		if errors.Is(err, context.Canceled) {
			h.operation.Phase = "cancelled"
		} else if err != nil {
			h.operation.Phase = "failed"
			h.operation.Error = "操作失败"
		}
	}, true
}

func (h *BackupHandler) routeOperation(c *gin.Context, phase string) (context.Context, func(), bool) {
	ctx, finish, ok := h.beginOperation(c.Request.Context(), phase)
	if !ok {
		c.JSON(http.StatusConflict, gin.H{"error": "已有备份或恢复任务正在运行"})
		return nil, nil, false
	}
	return ctx, func() {
		err := ctx.Err()
		h.operationMu.Lock()
		finalizing := h.operation.Phase == "finalize"
		h.operationMu.Unlock()
		if finalizing && c.Writer.Status() < 400 {
			err = nil
		}
		if err == nil && c.Writer.Status() >= 400 {
			err = fmt.Errorf("操作失败")
		}
		finish(err)
	}, true
}

func (h *BackupHandler) progress(phase, table string, rows, bytes int64) {
	h.operationMu.Lock()
	defer h.operationMu.Unlock()
	if phase != "" && h.operation.Phase != phase {
		h.operation.Rows = 0
		h.operation.Table = ""
		h.operation.Bytes = 0
		h.operation.Phase = phase
	}
	if table != "" {
		h.operation.Table = table
	}
	h.operation.Rows += rows
	h.operation.Bytes += bytes
}

func (h *BackupHandler) BackupStatus(c *gin.Context) {
	h.operationMu.Lock()
	status := h.operation
	h.operationMu.Unlock()
	c.JSON(http.StatusOK, status)
}

func (h *BackupHandler) CancelBackup(c *gin.Context) {
	h.operationMu.Lock()
	if h.cancelOperation == nil {
		running := h.operation.Running
		h.operationMu.Unlock()
		message := "没有正在运行的任务"
		if running {
			message = "正在完成恢复，无法取消"
		}
		c.JSON(http.StatusConflict, gin.H{"error": message})
		return
	}
	h.cancelOperation()
	h.operationMu.Unlock()
	c.JSON(http.StatusAccepted, gin.H{"message": "已请求取消任务"})
}

// Cancellation is available while the transaction can still roll back. Once
// commit starts, finish file replacement even if the client disconnects.
func (h *BackupHandler) beginRestoreCommit(ctx context.Context) error {
	h.operationMu.Lock()
	defer h.operationMu.Unlock()
	if err := ctx.Err(); err != nil {
		return err
	}
	h.cancelOperation = nil
	h.operation.Phase = "finalize"
	h.operation.Table = ""
	return nil
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}

type backupWriter struct {
	ctx    context.Context
	writer io.Writer
	count  int64
	report func(int64)
}

func (w *backupWriter) Write(p []byte) (int, error) {
	if err := w.ctx.Err(); err != nil {
		return 0, err
	}
	if w.count+int64(len(p)) > maxRestoreArchiveSize {
		return 0, fmt.Errorf("备份 ZIP 超过 500MB 限制")
	}
	n, err := w.writer.Write(p)
	w.count += int64(n)
	w.report(int64(n))
	return n, err
}

// The same expanded-size limits apply on export and import, including JSON
// punctuation and manifests, so a generated archive can always pass validation.
type expandedBackupWriter struct {
	writer      io.Writer
	total       *int64
	size, limit int64
}

func (w *expandedBackupWriter) Write(p []byte) (int, error) {
	if w.size+int64(len(p)) > w.limit || *w.total+int64(len(p)) > int64(maxRestoreExpandedSize) {
		return 0, fmt.Errorf("备份解压后大小超过恢复限制")
	}
	n, err := w.writer.Write(p)
	w.size += int64(n)
	*w.total += int64(n)
	return n, err
}

// generateBackup retains the 1.1 format while keeping only one database row in memory.
func (h *BackupHandler) generateBackup(path string, includeUploads, includeSyncManifest bool) error {
	return h.generateBackupContext(context.Background(), path, includeUploads, includeSyncManifest, nil)
}

func (h *BackupHandler) generateBackupContext(ctx context.Context, path string, includeUploads, includeSyncManifest bool, releaseWrites func()) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if includeUploads && releaseWrites == nil && h.acquireBackupGate != nil {
		release, err := h.acquireBackupGate(ctx)
		if err != nil {
			return err
		}
		var once sync.Once
		releaseWrites = func() { once.Do(release) }
		defer releaseWrites()
	}
	tx := h.db.WithContext(ctx).Begin(&sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if tx.Error != nil {
		return fmt.Errorf("开始一致性备份事务失败: %w", tx.Error)
	}
	defer tx.Rollback()
	// BEGIN alone does not acquire a PostgreSQL MVCC snapshot. Pin it while the
	// application write lease is still exclusive, before linking upload inodes.
	if err := tx.Exec("SELECT txid_current_snapshot()").Error; err != nil {
		return err
	}
	uploadDir := h.uploadDir
	frozenDir := ""
	snapshotName := ""
	complete := false
	if includeSyncManifest || includeUploads {
		snapshotName = strings.TrimSuffix(strings.TrimSuffix(strings.TrimPrefix(filepath.Base(path), "."), ".tmp"), ".zip")
		var err error
		frozenDir, err = h.freezeUploads(ctx, snapshotName)
		if err != nil {
			return err
		}
		uploadDir = frozenDir
		defer func() {
			if !complete || !includeSyncManifest {
				_ = os.RemoveAll(frozenDir)
			}
		}()
	}
	if releaseWrites != nil {
		releaseWrites()
	}
	out, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return fmt.Errorf("创建备份文件失败: %w", err)
	}
	defer func() {
		_ = out.Close()
		if !complete {
			_ = os.Remove(path)
		}
	}()
	h.progress("export", "", 0, 0)
	output := &backupWriter{ctx: ctx, writer: out, report: func(n int64) { h.progress("", "", 0, n) }}
	zw := zip.NewWriter(output)
	prefix := "backup-" + time.Now().UTC().Format("2006-01-02")
	entry, err := zw.Create(prefix + "/data.json")
	if err != nil {
		return err
	}
	var expanded int64
	jsonWriter := bufio.NewWriterSize(&expandedBackupWriter{writer: entry, total: &expanded, limit: maxRestoreDataJSONSize}, 64*1024)
	if _, err = fmt.Fprintf(jsonWriter, `{"version":"1.1","created_at":%q,"data":{`, time.Now().UTC().Format(time.RFC3339)); err != nil {
		return err
	}
	for i, table := range backupTables {
		h.progress("export", table, 0, 0)
		if i > 0 {
			if _, err = jsonWriter.WriteString(","); err != nil {
				return err
			}
		}
		if _, err = fmt.Fprintf(jsonWriter, "%q:[", table); err != nil {
			return err
		}
		_, err := h.streamTable(ctx, tx, table, jsonWriter, maxRestoreDataJSONSize)
		if err != nil {
			return err
		}
		if _, err = jsonWriter.WriteString("]"); err != nil {
			return err
		}
	}
	if _, err = jsonWriter.WriteString("}}"); err != nil {
		return err
	}
	if err = jsonWriter.Flush(); err != nil {
		return err
	}
	if err = tx.Commit().Error; err != nil {
		return fmt.Errorf("完成一致性备份事务失败: %w", err)
	}
	if includeSyncManifest {
		h.progress("hash", "", 0, 0)
		manifest, err := buildSyncUploadManifestContext(ctx, uploadDir)
		if err != nil {
			return err
		}
		f, err := zw.Create(prefix + "/uploads-manifest.json")
		if err != nil {
			return err
		}
		if err = json.NewEncoder(&expandedBackupWriter{writer: f, total: &expanded, limit: maxRestoreManifestSize}).Encode(manifest); err != nil {
			return err
		}
		f, err = zw.Create(prefix + "/snapshot-uploads.json")
		if err != nil {
			return err
		}
		if err = json.NewEncoder(&expandedBackupWriter{writer: f, total: &expanded, limit: 4096}).Encode(map[string]string{"directory": snapshotName}); err != nil {
			return err
		}
	}
	if includeUploads {
		h.progress("uploads", "", 0, 0)
		err = walkUploadFiles(ctx, uploadDir, func(path, rel string, info os.FileInfo) error {
			if uint64(info.Size()) > maxRestoreEntrySize || expanded+info.Size() > int64(maxRestoreExpandedSize) {
				return fmt.Errorf("备份解压后大小超过恢复限制")
			}
			f, err := zw.Create(prefix + "/uploads/" + filepath.ToSlash(rel))
			if err != nil {
				return err
			}
			src, err := os.Open(path)
			if err != nil {
				return err
			}
			_, copyErr := io.Copy(&expandedBackupWriter{writer: f, total: &expanded, limit: int64(maxRestoreEntrySize)}, contextReader{ctx, src})
			closeErr := src.Close()
			if copyErr != nil {
				return copyErr
			}
			return closeErr
		})
		if err != nil {
			return fmt.Errorf("打包上传文件失败: %w", err)
		}
	}
	if err = zw.Close(); err != nil {
		return err
	}
	if err = out.Close(); err != nil {
		return err
	}
	complete = true
	return nil
}

func (h *BackupHandler) streamTable(ctx context.Context, tx *gorm.DB, table string, w io.Writer, remaining int64) (int64, error) {
	query := tx.Table(table)
	if table == "site_configs" {
		query = query.Where("key NOT IN ?", []string{restoreTransactionKey, "sync_apply_state"})
	}
	rows, err := query.Rows()
	if err != nil {
		return 0, fmt.Errorf("导出 %s 失败: %w", table, err)
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return 0, err
	}
	types, err := rows.ColumnTypes()
	if err != nil {
		return 0, err
	}
	var size int64
	first := true
	for rows.Next() {
		if err := ctx.Err(); err != nil {
			return size, err
		}
		values := make([]interface{}, len(columns))
		dest := make([]interface{}, len(columns))
		for i := range values {
			dest[i] = &values[i]
		}
		if err := rows.Scan(dest...); err != nil {
			return size, err
		}
		row := make(map[string]interface{}, len(columns))
		for i, col := range columns {
			v := values[i]
			if b, ok := v.([]byte); ok && types[i].DatabaseTypeName() != "BYTEA" {
				v = string(b)
			}
			row[col] = v
		}
		data, err := json.Marshal(row)
		if err != nil {
			return size, err
		}
		size += int64(len(data)) + 1
		if size > remaining {
			return size, fmt.Errorf("备份数据超过 2GB 恢复限制")
		}
		if !first {
			if _, err = w.Write([]byte(",")); err != nil {
				return size, err
			}
		}
		first = false
		if _, err = w.Write(data); err != nil {
			return size, err
		}
		h.progress("", table, 1, 0)
	}
	return size, rows.Err()
}

func walkUploadFiles(ctx context.Context, uploadDir string, visit func(string, string, os.FileInfo) error) error {
	err := filepath.Walk(uploadDir, func(path string, info os.FileInfo, walkErr error) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			if path != uploadDir && info.Name() == ".sync-snapshots" {
				return filepath.SkipDir
			}
			return nil
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("上传目录包含不支持的文件类型: %s", path)
		}
		rel, err := filepath.Rel(uploadDir, path)
		if err != nil {
			return err
		}
		return visit(path, rel, info)
	})
	var pathErr *os.PathError
	if errors.As(err, &pathErr) && os.IsNotExist(err) && filepath.Clean(pathErr.Path) == filepath.Clean(uploadDir) {
		return nil
	}
	return err
}

func (h *BackupHandler) freezeUploads(ctx context.Context, name string) (string, error) {
	root := filepath.Join(h.uploadDir, ".sync-snapshots")
	if err := os.MkdirAll(root, 0750); err != nil {
		return "", err
	}
	frozen := filepath.Join(root, name)
	if err := os.Mkdir(frozen, 0750); err != nil {
		return "", err
	}
	err := walkUploadFiles(ctx, h.uploadDir, func(path, rel string, _ os.FileInfo) error {
		target := filepath.Join(frozen, rel)
		if err := os.MkdirAll(filepath.Dir(target), 0750); err != nil {
			return err
		}
		return os.Link(path, target)
	})
	if err != nil {
		_ = os.RemoveAll(frozen)
		return "", err
	}
	return frozen, nil
}

func (h *BackupHandler) buildSyncUploadManifest() ([]syncUploadFile, error) {
	return buildSyncUploadManifestContext(context.Background(), h.uploadDir)
}
func buildSyncUploadManifestContext(ctx context.Context, uploadDir string) ([]syncUploadFile, error) {
	manifest := make([]syncUploadFile, 0)
	err := walkUploadFiles(ctx, uploadDir, func(path, rel string, info os.FileInfo) error {
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		hash := sha256.New()
		_, copyErr := io.Copy(hash, contextReader{ctx, f})
		closeErr := f.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
		manifest = append(manifest, syncUploadFile{Path: filepath.ToSlash(rel), Size: info.Size(), SHA256: fmt.Sprintf("%x", hash.Sum(nil))})
		return nil
	})
	return manifest, err
}

// restoreFromZip parses and restores data from a zip reader
func (h *BackupHandler) restoreFromZip(zr *zip.Reader) error {
	return h.restoreFromZipWithLocalSyncConfigs(zr, nil)
}

func (h *BackupHandler) restoreFromZipWithLocalSyncConfigs(zr *zip.Reader, localSyncConfigs []model.SiteConfig) error {
	return h.restoreFromZipContext(context.Background(), zr, localSyncConfigs)
}

// Validate and spool each table before touching the live database. Spooling also
// handles legacy JSON whose object keys are alphabetical rather than FK order.
func (h *BackupHandler) restoreFromZipContext(ctx context.Context, zr *zip.Reader, localSyncConfigs []model.SiteConfig) error {
	if localSyncConfigs == nil {
		if h.acquireBackupGate != nil {
			release, err := h.acquireBackupGate(ctx)
			if err != nil {
				return err
			}
			defer release()
		}
		// The role may change while an ordinary restore waits for the gate.
		// Sync restore already holds the gate and deliberately writes a standby.
		var settings []model.SiteConfig
		if err := h.db.WithContext(ctx).Where("key IN ?", []string{"sync_enabled", "sync_role"}).Find(&settings).Error; err != nil {
			return fmt.Errorf("读取本机同步角色失败: %w", err)
		}
		values := make(map[string]string, len(settings))
		for _, setting := range settings {
			values[setting.Key] = setting.Value
		}
		if values["sync_enabled"] == "true" && values["sync_role"] == "standby" {
			return errRestoreStandby
		}
	}
	if err := h.RecoverInterruptedRestore(); err != nil {
		return err
	}
	if err := validateRestoreArchive(zr); err != nil {
		return err
	}
	var dataFile *zip.File
	for _, f := range zr.File {
		if filepath.Base(f.Name) == "data.json" {
			if dataFile != nil {
				return fmt.Errorf("备份文件包含多个 data.json")
			}
			dataFile = f
		}
	}
	if dataFile == nil {
		return fmt.Errorf("备份文件缺少 data.json")
	}
	spool, err := os.MkdirTemp(h.backupDir, ".restore-data-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(spool)
	rc, err := dataFile.Open()
	if err != nil {
		return err
	}
	h.progress("validate", "", 0, 0)
	err = h.spoolRestoreData(ctx, rc, spool)
	closeErr := rc.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err = ctx.Err(); err != nil {
		return err
	}
	staged, err := h.stageRestoreUploads(ctx, zr)
	if err != nil {
		return fmt.Errorf("暂存上传文件失败: %w", err)
	}
	defer func() {
		// Retain recovery material when database commit outcome is unknown.
		if _, err := os.Stat(h.uploadDir + ".restore-journal.json"); os.IsNotExist(err) {
			_ = os.RemoveAll(h.uploadDir + ".restore-stage")
		}
	}()
	tx := h.db.WithContext(context.WithoutCancel(ctx)).Begin().WithContext(ctx)
	if tx.Error != nil {
		return tx.Error
	}
	defer tx.Rollback()
	for _, table := range truncateOrder {
		if err = tx.Exec("TRUNCATE TABLE " + table + " CASCADE").Error; err != nil {
			return fmt.Errorf("清空表 %s 失败: %w", table, err)
		}
	}
	h.progress("restore", "", 0, 0)
	for _, table := range backupTables {
		h.progress("restore", table, 0, 0)
		file, err := os.Open(filepath.Join(spool, table))
		if err != nil {
			return err
		}
		decoder := json.NewDecoder(contextReader{ctx, file})
		decoder.UseNumber()
		batch := make([]map[string]interface{}, 0, restoreBatchSize)
		columns := ""
		batchBytes := int64(0)
		flush := func() error {
			if len(batch) == 0 {
				return nil
			}
			if err := tx.Table(table).Create(&batch).Error; err != nil {
				return fmt.Errorf("恢复 %s 失败: %w", table, err)
			}
			h.progress("", table, int64(len(batch)), batchBytes)
			batch = batch[:0]
			batchBytes = 0
			return nil
		}
		for {
			var row map[string]interface{}
			offset := decoder.InputOffset()
			err = decoder.Decode(&row)
			if err == io.EOF {
				break
			}
			if err != nil {
				file.Close()
				return err
			}
			if table == "site_configs" {
				key, _ := row["key"].(string)
				if key == restoreTransactionKey || key == "sync_apply_state" || (localSyncConfigs != nil && strings.HasPrefix(key, "sync_")) {
					continue
				}
			}
			if table == "passkeys" && (row["credential_id"] == nil || row["public_key"] == nil) {
				continue
			}
			if table == "users" {
				row["session_epoch"] = uuid.NewString()
				row["reset_token"] = ""
			}
			if table == "posts" {
				if _, present := row["scheduled_at"]; !present && row["status"] == "draft" {
					if value, ok := row["published_at"].(string); ok {
						if scheduled, err := time.Parse(time.RFC3339Nano, value); err == nil && scheduled.After(time.Now()) {
							row["scheduled_at"] = value
							row["published_at"] = nil
						}
					}
				}
			}
			cleaned := make(map[string]interface{}, len(row))
			names := make([]string, 0, len(row))
			for _, col := range restoreSafeColumns[table] {
				if value, ok := row[col]; ok {
					cleaned[col] = normalizeRestoreValue(table, col, value)
					names = append(names, col)
				}
			}
			// Comment parents may occur in any later batch. Insert all comments
			// without edges, then restore their parent links with the FK still enabled.
			if table == "comments" && cleaned["parent_id"] != nil {
				if cleaned["id"] == nil {
					file.Close()
					return fmt.Errorf("恢复评论父关系失败: 缺少评论ID")
				}
				cleaned["parent_id"] = nil
			}
			if len(cleaned) == 0 {
				file.Close()
				return fmt.Errorf("恢复 %s 失败: 记录不包含可恢复字段", table)
			}
			key := strings.Join(names, ",")
			if len(batch) > 0 && (key != columns || len(batch) >= restoreBatchSize || batchBytes >= 4*1024*1024) {
				if err = flush(); err != nil {
					file.Close()
					return err
				}
			}
			columns = key
			batch = append(batch, cleaned)
			batchBytes += decoder.InputOffset() - offset
		}
		file.Close()
		if err = flush(); err != nil {
			return err
		}
		if table == "comments" {
			if err = h.restoreCommentParents(ctx, tx, filepath.Join(spool, table)); err != nil {
				return err
			}
		}
		if table == "site_configs" && len(localSyncConfigs) > 0 {
			if err = tx.Create(&localSyncConfigs).Error; err != nil {
				return err
			}
		}
	}
	if err = tx.Exec("UPDATE users SET token_version = token_version + 1, reset_token = ''").Error; err != nil {
		return fmt.Errorf("使旧会话失效失败: %w", err)
	}
	if tx.Migrator().HasTable("media_file_cleanups") {
		if err = tx.Exec("DELETE FROM media_file_cleanups").Error; err != nil {
			return err
		}
	}
	if err = h.beginRestoreCommit(ctx); err != nil {
		return err
	}
	// The boundary is irreversible from the client's perspective. The SQL
	// transaction itself was begun without cancellation; detach final statements
	// too, while every earlier validation/query remains request-cancellable.
	tx = tx.WithContext(context.WithoutCancel(ctx))
	if staged {
		journal, err := h.prepareRestoreJournal()
		if err != nil {
			return err
		}
		if err = tx.Create(&model.SiteConfig{Key: restoreTransactionKey, Value: journal.ID, Type: "string"}).Error; err != nil {
			tx.Rollback()
			return errors.Join(err, h.RecoverInterruptedRestore())
		}
		if journal.HadUploads {
			err = os.Rename(h.uploadDir, h.uploadDir+".restore-old")
		}
		if err == nil {
			err = os.Rename(h.uploadDir+".restore-stage", h.uploadDir)
		}
		if err == nil {
			err = syncRestoreDirectory(filepath.Dir(h.uploadDir))
		}
		if err != nil {
			tx.Rollback()
			return errors.Join(err, h.RecoverInterruptedRestore())
		}
	}
	commitErr := tx.Commit().Error
	if staged {
		// Resolve by the database marker even when Commit returned a transport error.
		if err := h.RecoverInterruptedRestore(); err != nil {
			return fmt.Errorf("恢复提交状态待恢复: %w", errors.Join(commitErr, err))
		}
	}
	if commitErr != nil {
		return fmt.Errorf("提交事务失败: %w", commitErr)
	}
	return nil
}

// Re-read the validated table spool to apply self-references in bounded batches.
// All parent rows now exist; malformed or missing parents still fail the active
// restore transaction and roll back both inserts and previously applied edges.
func (h *BackupHandler) restoreCommentParents(ctx context.Context, tx *gorm.DB, path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	decoder := json.NewDecoder(contextReader{ctx, file})
	placeholders := make([]string, 0, restoreBatchSize)
	values := make([]interface{}, 0, restoreBatchSize*2)
	flush := func() error {
		if len(placeholders) == 0 {
			return nil
		}
		query := "UPDATE comments AS comments SET parent_id=links.parent_id FROM (VALUES " + strings.Join(placeholders, ",") + ") AS links(id,parent_id) WHERE comments.id=links.id"
		if err := tx.Exec(query, values...).Error; err != nil {
			return fmt.Errorf("恢复评论父关系失败: %w", err)
		}
		placeholders = placeholders[:0]
		values = values[:0]
		return nil
	}
	for {
		var row struct {
			ID       string  `json:"id"`
			ParentID *string `json:"parent_id"`
		}
		err = decoder.Decode(&row)
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if row.ParentID == nil {
			continue
		}
		if row.ID == "" {
			return fmt.Errorf("恢复评论父关系失败: 缺少评论ID")
		}
		placeholders = append(placeholders, "(?::uuid,?::uuid)")
		values = append(values, row.ID, *row.ParentID)
		if len(placeholders) >= restoreBatchSize {
			if err = flush(); err != nil {
				return err
			}
		}
	}
	return flush()
}

func expectJSONToken(decoder *json.Decoder, expected json.Delim) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	if token != expected {
		return fmt.Errorf("无效的备份 JSON，预期 %s", string(expected))
	}
	return nil
}

func (h *BackupHandler) spoolRestoreData(ctx context.Context, r io.Reader, dir string) error {
	decoder := json.NewDecoder(contextReader{ctx, io.LimitReader(r, maxRestoreDataJSONSize+1)})
	decoder.UseNumber()
	if err := expectJSONToken(decoder, '{'); err != nil {
		return err
	}
	fields := map[string]bool{}
	tables := map[string]bool{}
	version := ""
	var lastOffset int64
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		key, ok := token.(string)
		if !ok || fields[key] {
			return fmt.Errorf("重复或无效的备份字段")
		}
		fields[key] = true
		switch key {
		case "version":
			if err = decoder.Decode(&version); err != nil {
				return err
			}
		case "created_at":
			var value string
			if err = decoder.Decode(&value); err != nil {
				return err
			}
		case "data":
			if err = expectJSONToken(decoder, '{'); err != nil {
				return err
			}
			for decoder.More() {
				token, err = decoder.Token()
				if err != nil {
					return err
				}
				table, ok := token.(string)
				if !ok || restoreSafeColumns[table] == nil || tables[table] {
					return fmt.Errorf("未知或重复的数据表: %v", token)
				}
				tables[table] = true
				if err = expectJSONToken(decoder, '['); err != nil {
					return err
				}
				file, err := os.OpenFile(filepath.Join(dir, table), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
				if err != nil {
					return err
				}
				buffer := bufio.NewWriterSize(file, 64*1024)
				encoder := json.NewEncoder(buffer)
				for decoder.More() {
					var row map[string]interface{}
					if err = decoder.Decode(&row); err != nil {
						file.Close()
						return err
					}
					if len(row) == 0 {
						file.Close()
						return fmt.Errorf("数据表 %s 包含空记录", table)
					}
					if decoder.InputOffset() > maxRestoreDataJSONSize {
						file.Close()
						return fmt.Errorf("data.json 过大")
					}
					if err = encoder.Encode(row); err != nil {
						file.Close()
						return err
					}
					offset := decoder.InputOffset()
					h.progress("validate", table, 1, offset-lastOffset)
					lastOffset = offset
				}
				flushErr := buffer.Flush()
				closeErr := file.Close()
				if flushErr != nil {
					return flushErr
				}
				if closeErr != nil {
					return closeErr
				}
				if err = expectJSONToken(decoder, ']'); err != nil {
					return err
				}
			}
			if err = expectJSONToken(decoder, '}'); err != nil {
				return err
			}
		default:
			return fmt.Errorf("未知的备份字段: %s", key)
		}
	}
	if err := expectJSONToken(decoder, '}'); err != nil {
		return err
	}
	var trailing interface{}
	if err := decoder.Decode(&trailing); err != io.EOF {
		return fmt.Errorf("备份 JSON 包含尾随数据: %v", err)
	}
	if version != "1.0" && version != "1.1" {
		return fmt.Errorf("不支持的备份版本: %s", version)
	}
	for _, table := range backupTables {
		if !tables[table] {
			return fmt.Errorf("备份文件缺少数据表: %s", table)
		}
	}
	return ctx.Err()
}

func validateRestoreArchive(zr *zip.Reader) error {
	var total uint64
	for _, f := range zr.File {
		limit := maxRestoreEntrySize
		if filepath.Base(f.Name) == "data.json" {
			limit = uint64(maxRestoreDataJSONSize)
		}
		if f.UncompressedSize64 > limit {
			return fmt.Errorf("ZIP 条目过大: %s", f.Name)
		}
		if total > maxRestoreExpandedSize-f.UncompressedSize64 {
			return fmt.Errorf("ZIP 解压后总大小超过限制")
		}
		total += f.UncompressedSize64
	}
	return nil
}

func normalizeRestoreValue(table, column string, value interface{}) interface{} {
	if number, ok := value.(json.Number); ok {
		return number.String()
	}
	if table == "passkeys" && column == "public_key" {
		if encoded, ok := value.(string); ok {
			if decoded, err := base64.StdEncoding.DecodeString(encoded); err == nil {
				return decoded
			}
		}
	}
	return value
}

// ===== Routes =====

// CreateBackup generates a backup and saves it to the backups directory
func (h *BackupHandler) CreateBackup(c *gin.Context) {
	ctx, finish, ok := h.routeOperation(c, "export")
	if !ok {
		return
	}
	defer finish()
	filename := fmt.Sprintf("backup-%s.zip", time.Now().UTC().Format("2006-01-02T150405.000000000"))
	path := filepath.Join(h.backupDir, filename)
	temporaryPath := filepath.Join(h.backupDir, "."+filename+".tmp")
	defer os.Remove(temporaryPath)
	err := h.generateBackupContext(ctx, temporaryPath, true, false, nil)
	if err == nil {
		err = os.Rename(temporaryPath, path)
	}
	if err != nil {
		if errors.Is(err, context.Canceled) {
			c.JSON(http.StatusConflict, gin.H{"error": "操作已取消"})
			return
		}
		utils.LogError("操作失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "备份创建成功", "filename": filename})
}

// CreateSyncSnapshot 创建仅含数据库的跨机同步快照。
// 媒体文件由 rsync 单独同步，以便按文件续传并减少重复传输。
func (h *BackupHandler) CreateSyncSnapshot() (string, error) {
	return h.CreateSyncSnapshotContext(context.Background(), nil)
}

func (h *BackupHandler) CreateSyncSnapshotContext(ctx context.Context, releaseWrites func()) (name string, resultErr error) {
	ctx, finish, ok := h.beginOperation(ctx, "snapshot")
	if !ok {
		return "", fmt.Errorf("已有备份或恢复任务正在运行")
	}
	defer func() { finish(resultErr) }()
	syncDir := filepath.Join(h.backupDir, "sync")
	if err := os.MkdirAll(syncDir, 0700); err != nil {
		return "", fmt.Errorf("创建同步目录失败: %w", err)
	}
	filename := fmt.Sprintf("sync-%s.zip", time.Now().UTC().Format("2006-01-02T150405.000000000"))
	temporaryPath := filepath.Join(syncDir, "."+filename+".tmp")
	if err := h.generateBackupContext(ctx, temporaryPath, false, true, releaseWrites); err != nil {
		return "", err
	}
	finalPath := filepath.Join(syncDir, filename)
	published := false
	defer func() {
		if !published {
			_ = os.Remove(temporaryPath)
			_ = os.Remove(finalPath)
			_ = os.RemoveAll(filepath.Join(h.uploadDir, ".sync-snapshots", strings.TrimSuffix(filename, ".zip")))
		}
	}()
	if err := os.Rename(temporaryPath, finalPath); err != nil {
		_ = os.Remove(temporaryPath)
		return "", fmt.Errorf("发布同步快照失败: %w", err)
	}
	// 同步快照默认仅允许所有者与组读取；部署文档中的 blogsync 默认 ACL
	// 会借助组权限掩码获得读取权限，而不会把快照暴露给所有本机用户。
	if err := os.Chmod(finalPath, 0640); err != nil {
		return "", fmt.Errorf("设置同步快照权限失败: %w", err)
	}
	published = true
	if err := removeOldSyncSnapshots(syncDir, filename); err != nil {
		return "", fmt.Errorf("清理旧同步快照失败: %w", err)
	}
	if err := h.retireSyncUploadSources(strings.TrimSuffix(filename, ".zip"), time.Now()); err != nil {
		return "", err
	}

	return filename, nil
}

// VerifySyncSnapshotUploads 验证备机暂存目录是否完整匹配快照中的媒体清单。
func (h *BackupHandler) VerifySyncSnapshotUploads(snapshotPath, uploadDir string) error {
	f, err := os.Open(snapshotPath)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	zr, err := zip.NewReader(f, info.Size())
	if err != nil {
		return err
	}
	var manifest []syncUploadFile
	for _, entry := range zr.File {
		if filepath.Base(entry.Name) != "uploads-manifest.json" {
			continue
		}
		rc, err := entry.Open()
		if err != nil {
			return err
		}
		data, readErr := io.ReadAll(io.LimitReader(rc, maxRestoreManifestSize+1))
		rc.Close()
		if readErr != nil || int64(len(data)) > maxRestoreManifestSize {
			return fmt.Errorf("读取上传文件清单失败")
		}
		if err := json.Unmarshal(data, &manifest); err != nil {
			return fmt.Errorf("解析上传文件清单失败: %w", err)
		}
		break
	}
	if manifest == nil {
		return fmt.Errorf("同步快照缺少上传文件清单")
	}
	for _, expected := range manifest {
		if expected.Path == "" || filepath.IsAbs(expected.Path) || strings.Contains(expected.Path, "..") {
			return fmt.Errorf("上传文件清单包含无效路径")
		}
		path := filepath.Join(uploadDir, filepath.FromSlash(expected.Path))
		if !strings.HasPrefix(path, filepath.Clean(uploadDir)+string(filepath.Separator)) {
			return fmt.Errorf("上传文件清单路径越界")
		}
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() || info.Size() != expected.Size {
			return fmt.Errorf("上传文件不完整或大小不匹配: %s", expected.Path)
		}
		file, err := os.Open(path)
		if err != nil {
			return err
		}
		hash := sha256.New()
		_, copyErr := io.Copy(hash, file)
		closeErr := file.Close()
		if copyErr != nil || closeErr != nil || fmt.Sprintf("%x", hash.Sum(nil)) != expected.SHA256 {
			return fmt.Errorf("上传文件校验失败: %s", expected.Path)
		}
	}
	return nil
}

// removeOldSyncSnapshots 在新快照完整落盘后删除旧同步快照。
// 仅匹配 sync-*.zip，避免影响普通备份或备机下载目录。
func removeOldSyncSnapshots(syncDir, currentFilename string) error {
	entries, err := os.ReadDir(syncDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || entry.Name() == currentFilename || !strings.HasPrefix(entry.Name(), "sync-") || !strings.HasSuffix(entry.Name(), ".zip") {
			continue
		}
		if err := os.Remove(filepath.Join(syncDir, entry.Name())); err != nil {
			return err
		}
	}
	return nil
}

// RestoreSyncSnapshot 应用已校验的数据库同步快照，并保留备机本地的同步配置。
func (h *BackupHandler) RestoreSyncSnapshot(path string) error {
	return h.RestoreSyncSnapshotContext(context.Background(), path)
}

func (h *BackupHandler) RestoreSyncSnapshotContext(ctx context.Context, path string) (resultErr error) {
	ctx, finish, ok := h.beginOperation(ctx, "validate")
	if !ok {
		return fmt.Errorf("已有备份或恢复任务正在运行")
	}
	defer func() { finish(resultErr) }()
	// 同步角色、任务计划、SSH 目标和加密私钥只属于本机。它们会直接写入
	// 同一次恢复事务，避免提交快照后再单独恢复配置造成中间不一致。
	localConfigs := make([]model.SiteConfig, 0)
	if err := h.db.WithContext(ctx).Where("key LIKE ?", "sync_%").Find(&localConfigs).Error; err != nil {
		return fmt.Errorf("读取本机同步配置失败: %w", err)
	}
	for i := range localConfigs {
		if localConfigs[i].Key == "sync_apply_state" {
			// 此值随恢复事务一起提交，供崩溃恢复流程区分数据库是否已成功切换。
			localConfigs[i].Value = "db-applied"
			break
		}
	}

	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	zr, err := zip.NewReader(f, info.Size())
	if err != nil {
		return err
	}
	return h.restoreFromZipContext(ctx, zr, localConfigs)
}

// ListBackups returns all backup files in the backups directory
func (h *BackupHandler) ListBackups(c *gin.Context) {
	entries, err := os.ReadDir(h.backupDir)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"items": []interface{}{}})
		return
	}

	var backups []map[string]interface{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "backup-") || !strings.HasSuffix(entry.Name(), ".zip") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		// Parse timestamps from both current and legacy backup filenames.
		createdAt := info.ModTime().UTC().Format(time.RFC3339)
		timestamp := strings.TrimSuffix(strings.TrimPrefix(entry.Name(), "backup-"), ".zip")
		for _, layout := range []string{"2006-01-02T150405.000000000", "2006-01-02T150405"} {
			if t, err := time.Parse(layout, timestamp); err == nil {
				createdAt = t.UTC().Format(time.RFC3339Nano)
				break
			}
		}

		backups = append(backups, map[string]interface{}{
			"filename":   entry.Name(),
			"size":       info.Size(),
			"created_at": createdAt,
		})
	}

	// Sort by created_at descending
	sort.Slice(backups, func(i, j int) bool {
		return backups[i]["created_at"].(string) > backups[j]["created_at"].(string)
	})

	c.JSON(http.StatusOK, gin.H{"items": backups})
}

// DownloadBackup streams a saved backup file
func (h *BackupHandler) DownloadBackup(c *gin.Context) {
	filename := c.Param("filename")
	// Security: prevent path traversal
	if strings.Contains(filename, "/") || strings.Contains(filename, "..") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的文件名"})
		return
	}

	path := filepath.Join(h.backupDir, filename)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "备份文件不存在"})
		return
	}

	c.Header("Content-Type", "application/zip")
	c.FileAttachment(path, filename)
}

// DeleteBackup deletes a saved backup file
func (h *BackupHandler) DeleteBackup(c *gin.Context) {
	filename := c.Param("filename")
	if strings.Contains(filename, "/") || strings.Contains(filename, "..") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的文件名"})
		return
	}

	path := filepath.Join(h.backupDir, filename)
	if err := os.Remove(path); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "备份文件不存在"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

// Tables to skip when clearing all data (user accounts, settings)
var clearSkipTables = map[string]bool{
	"users": true, "site_configs": true,
}

// ClearAllData truncates content tables and removes uploaded files.
// Users and site configs are preserved.
func (h *BackupHandler) ClearAllData(c *gin.Context) {
	var input struct {
		Confirm string `json:"confirm" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.Confirm != "CLEAR_ALL" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "确认信息不正确"})
		return
	}

	tx := h.db.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法开始清空操作"})
		return
	}
	for _, t := range truncateOrder {
		if clearSkipTables[t] {
			continue
		}
		if err := tx.Exec(fmt.Sprintf("TRUNCATE TABLE %s CASCADE", t)).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("清空表 %s 失败: %v", t, err)})
			return
		}
	}
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "提交清空操作失败"})
		return
	}

	// Also clear uploaded files
	uploadDir := h.uploadDir
	if !filepath.IsAbs(uploadDir) {
		absDir, _ := filepath.Abs(uploadDir)
		uploadDir = absDir
	}
	if entries, err := os.ReadDir(uploadDir); err == nil {
		for _, entry := range entries {
			if entry.Name() == ".sync-snapshots" {
				continue
			}
			os.RemoveAll(filepath.Join(uploadDir, entry.Name()))
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "全站数据已清空"})
}

// RestoreUpload handles uploaded zip file restore
func (h *BackupHandler) RestoreUpload(c *gin.Context) {
	ctx, finish, ok := h.routeOperation(c, "upload")
	if !ok {
		return
	}
	defer finish()
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxRestoreArchiveSize+(1<<20))
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请上传备份文件"})
		return
	}
	defer file.Close()

	if header.Size > maxRestoreArchiveSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "备份文件过大（最大 500MB）"})
		return
	}

	tmp, err := os.CreateTemp(h.backupDir, "restore-upload-*.zip")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法创建临时文件"})
		return
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	defer tmp.Close()
	size, err := io.Copy(tmp, io.LimitReader(contextReader{ctx, file}, maxRestoreArchiveSize+1))
	if err != nil || size > maxRestoreArchiveSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "备份文件过大或读取失败"})
		return
	}

	zr, err := zip.NewReader(tmp, size)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 ZIP 文件"})
		return
	}

	if err := h.restoreFromZipContext(ctx, zr, nil); err != nil {
		if errors.Is(err, errRestoreStandby) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": errRestoreStandby.Error()})
			return
		}
		if errors.Is(err, context.Canceled) {
			c.JSON(http.StatusConflict, gin.H{"error": "操作已取消"})
			return
		}
		utils.LogError("操作失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "恢复完成"})
}

// RestoreURL downloads a zip from URL and restores
func (h *BackupHandler) RestoreURL(c *gin.Context) {
	ctx, finish, ok := h.routeOperation(c, "download")
	if !ok {
		return
	}
	defer finish()
	var input struct {
		URL string `json:"url" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入下载地址"})
		return
	}

	// Validate URL to prevent SSRF
	parsedURL, err := url.Parse(input.URL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的下载地址"})
		return
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持 http/https 协议"})
		return
	}
	if parsedURL.Hostname() == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "下载地址缺少主机名"})
		return
	}

	// Download with timeout and SSRF protection via custom transport
	transport := &http.Transport{
		DialContext: (&net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
	}
	transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		addrs, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
		if err != nil {
			return nil, err
		}
		for _, ip := range addrs {
			if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
				return nil, fmt.Errorf("拒绝连接非公网地址: %s", ip.String())
			}
		}
		if len(addrs) == 0 {
			return nil, fmt.Errorf("主机名没有可用地址")
		}
		// Dial the already-vetted address directly to prevent DNS rebinding
		// between validation and connection establishment.
		return (&net.Dialer{Timeout: 30 * time.Second}).DialContext(
			ctx, network, net.JoinHostPort(addrs[0].String(), port),
		)
	}
	client := &http.Client{
		Timeout:   10 * time.Minute,
		Transport: transport,
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, input.URL, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的下载地址"})
		return
	}
	resp, err := client.Do(request)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "下载失败"})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "下载地址返回异常状态"})
		return
	}
	if resp.ContentLength > maxRestoreArchiveSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "备份文件过大（最大 500MB）"})
		return
	}

	tmp, err := os.CreateTemp(h.backupDir, "restore-url-*.zip")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法创建临时文件"})
		return
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	defer tmp.Close()
	size, err := io.Copy(tmp, io.LimitReader(contextReader{ctx, resp.Body}, maxRestoreArchiveSize+1))
	if err != nil || size > maxRestoreArchiveSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "下载文件过大或读取失败"})
		return
	}

	zr, err := zip.NewReader(tmp, size)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "下载的文件不是有效的 ZIP"})
		return
	}

	if err := h.restoreFromZipContext(ctx, zr, nil); err != nil {
		if errors.Is(err, errRestoreStandby) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": errRestoreStandby.Error()})
			return
		}
		if errors.Is(err, context.Canceled) {
			c.JSON(http.StatusConflict, gin.H{"error": "操作已取消"})
			return
		}
		utils.LogError("操作失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "恢复完成"})
}

// RestoreLocal restores from a local backup file
func (h *BackupHandler) RestoreLocal(c *gin.Context) {
	ctx, finish, ok := h.routeOperation(c, "validate")
	if !ok {
		return
	}
	defer finish()
	var input struct {
		Filename string `json:"filename" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请指定备份文件"})
		return
	}

	// Security: prevent path traversal
	if strings.Contains(input.Filename, "/") || strings.Contains(input.Filename, "..") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的文件名"})
		return
	}

	path := filepath.Join(h.backupDir, input.Filename)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "备份文件不存在"})
		return
	}

	file, err := os.Open(path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取备份文件失败"})
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.Size() > maxRestoreArchiveSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "备份文件过大或读取失败"})
		return
	}

	zr, err := zip.NewReader(file, info.Size())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无效的备份文件"})
		return
	}

	if err := h.restoreFromZipContext(ctx, zr, nil); err != nil {
		if errors.Is(err, errRestoreStandby) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": errRestoreStandby.Error()})
			return
		}
		if errors.Is(err, context.Canceled) {
			c.JSON(http.StatusConflict, gin.H{"error": "操作已取消"})
			return
		}
		utils.LogError("操作失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "恢复完成"})
}

// CleanupOldBackups removes backups older than 7 days
func (h *BackupHandler) CleanupOldBackups() {
	entries, err := os.ReadDir(h.backupDir)
	if err != nil {
		return
	}
	deadline := time.Now().Add(-7 * 24 * time.Hour)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "backup-") || !strings.HasSuffix(entry.Name(), ".zip") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(deadline) {
			os.Remove(filepath.Join(h.backupDir, entry.Name()))
		}
	}
}
