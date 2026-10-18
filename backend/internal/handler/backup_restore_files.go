package handler

import (
	"archive/zip"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tano_blog/backend/internal/model"
)

const restoreTransactionKey = "internal_restore_transaction"

type restoreJournal struct {
	ID         string `json:"id"`
	HadUploads bool   `json:"had_uploads"`
}

// Both restore and clear-all publish the staged tree before committing its
// database marker. Recovery uses that marker to select the authoritative tree,
// even when the connection disappears during Commit.
func (h *BackupHandler) commitRestoreTransaction(ctx context.Context, tx *gorm.DB, staged bool) error {
	if err := h.beginRestoreCommit(ctx); err != nil {
		return err
	}
	// The transaction was begun without cancellation. Detach final statements
	// too so a disconnect cannot abandon the file switch after it starts.
	tx = tx.WithContext(context.WithoutCancel(ctx))
	rollbackFiles := func(cause error) error {
		rollbackErr := tx.Rollback().Error
		if errors.Is(rollbackErr, sql.ErrTxDone) {
			rollbackErr = nil
		}
		return errors.Join(cause, rollbackErr, h.RecoverInterruptedRestore())
	}
	if staged {
		journal, err := h.prepareRestoreJournal()
		if err != nil {
			return rollbackFiles(err)
		}
		// Clear-all preserves site_configs, including a marker from an earlier
		// operation. Updating it stays in the same transaction as the content.
		if err = tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "key"}},
			DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
		}).Create(&model.SiteConfig{Key: restoreTransactionKey, Value: journal.ID, Type: "string"}).Error; err != nil {
			return rollbackFiles(err)
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
			return rollbackFiles(err)
		}
	}
	commitErr := tx.Commit().Error
	if staged {
		if err := h.RecoverInterruptedRestore(); err != nil {
			return fmt.Errorf("恢复提交状态待恢复: %w", errors.Join(commitErr, err))
		}
	}
	if commitErr != nil {
		return fmt.Errorf("提交事务失败: %w", commitErr)
	}
	return nil
}

// A local journal survives process termination. Its ID is committed in the same
// database transaction as the restored data, so restart can resolve either side
// of the directory switch, including an ambiguous database Commit result.
func (h *BackupHandler) RecoverInterruptedRestore() error {
	return h.RecoverInterruptedRestoreContext(context.Background())
}

func (h *BackupHandler) RecoverInterruptedRestoreContext(ctx context.Context) error {
	raw, err := os.ReadFile(h.uploadDir + ".restore-journal.json")
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	var journal restoreJournal
	if err := json.Unmarshal(raw, &journal); err != nil || journal.ID == "" {
		return fmt.Errorf("恢复日志无效: %v", err)
	}
	var cfg model.SiteConfig
	recoveryCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	err = h.db.WithContext(recoveryCtx).Transaction(func(tx *gorm.DB) error {
		// An uncertain Commit can still be in flight on the server. A plain
		// MVCC read could see the preceding marker and incorrectly restore old
		// files. Wait for marker INSERT/UPDATE locks to resolve before reading.
		if err := tx.Exec("LOCK TABLE site_configs IN SHARE MODE").Error; err != nil {
			return err
		}
		err := tx.Where("key = ?", restoreTransactionKey).First(&cfg).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return err
	}
	current, old, stage := h.uploadDir, h.uploadDir+".restore-old", h.uploadDir+".restore-stage"
	if cfg.Value == journal.ID {
		// The database committed: the activated tree is authoritative.
		if _, err := os.Stat(current); err != nil {
			return fmt.Errorf("已提交恢复的上传目录缺失: %w", err)
		}
		if err := os.RemoveAll(old); err != nil {
			return err
		}
	} else {
		// The transaction rolled back or never committed. Restore the old tree if
		// its rename happened; otherwise current is still the original directory.
		if _, err := os.Stat(old); err == nil {
			if err := os.RemoveAll(current); err != nil {
				return err
			}
			if err := os.Rename(old, current); err != nil {
				return err
			}
		} else if !os.IsNotExist(err) {
			return err
		} else if !journal.HadUploads {
			if err := os.RemoveAll(current); err != nil {
				return err
			}
		}
	}
	if err := os.RemoveAll(stage); err != nil {
		return err
	}
	if err := syncRestoreDirectory(filepath.Dir(current)); err != nil {
		return err
	}
	if err := os.Remove(current + ".restore-journal.json"); err != nil {
		return err
	}
	return syncRestoreDirectory(filepath.Dir(current))
}

func syncRestoreDirectory(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return f.Sync()
}

func (h *BackupHandler) prepareRestoreJournal() (restoreJournal, error) {
	journal := restoreJournal{ID: uuid.NewString()}
	if _, err := os.Lstat(h.uploadDir + ".restore-old"); err == nil {
		return journal, fmt.Errorf("发现无恢复日志的旧上传目录，拒绝覆盖")
	} else if !os.IsNotExist(err) {
		return journal, err
	}
	_, err := os.Stat(h.uploadDir)
	if err != nil && !os.IsNotExist(err) {
		return journal, err
	}
	journal.HadUploads = err == nil
	if h.requireRecovery != nil {
		h.requireRecovery()
	}
	raw, err := json.Marshal(journal)
	if err != nil {
		return journal, err
	}
	path := h.uploadDir + ".restore-journal.json"
	file, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return journal, err
	}
	tempPath := file.Name()
	defer os.Remove(tempPath)
	_, err = file.Write(raw)
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return journal, err
	}
	// Publish only a complete, durable journal. Linking preserves exclusive
	// creation, so an unresolved journal can never be replaced by this attempt.
	if err := os.Link(tempPath, path); err != nil {
		return journal, err
	}
	if err := os.Remove(tempPath); err != nil {
		return journal, err
	}
	return journal, syncRestoreDirectory(filepath.Dir(path))
}

func uploadArchivePath(name string) (string, bool, error) {
	parts := strings.SplitN(name, "/uploads/", 2)
	if len(parts) != 2 {
		return "", false, nil
	}
	rel := parts[1]
	if rel == "" {
		return "", false, nil
	}
	clean := filepath.Clean(filepath.FromSlash(rel))
	if filepath.IsAbs(clean) || clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) || strings.Contains(rel, "\\") {
		return "", true, fmt.Errorf("无效的上传文件路径: %s", name)
	}
	for _, part := range strings.Split(filepath.ToSlash(clean), "/") {
		if part == ".sync-snapshots" {
			return "", true, fmt.Errorf("备份不能覆盖冻结快照: %s", name)
		}
	}
	return clean, true, nil
}

// Stage a merge of the existing tree and backup uploads. Legacy database-only
// archives leave uploads alone; unrelated existing files and pinned snapshots
// retain their historical behavior. Hard links avoid copying all local media,
// and replacements always use a new inode rather than writing through a link.
func (h *BackupHandler) stageRestoreUploads(ctx context.Context, zr *zip.Reader) (bool, error) {
	found := false
	for _, entry := range zr.File {
		_, upload, err := uploadArchivePath(entry.Name)
		if err != nil {
			return false, err
		}
		found = found || upload
	}
	if !found {
		return false, nil
	}
	stage := h.uploadDir + ".restore-stage"
	if err := os.RemoveAll(stage); err != nil {
		return false, err
	}
	if err := os.MkdirAll(stage, 0750); err != nil {
		return false, err
	}
	success := false
	defer func() {
		if !success {
			_ = os.RemoveAll(stage)
		}
	}()
	err := filepath.Walk(h.uploadDir, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			if path == h.uploadDir && os.IsNotExist(walkErr) {
				return nil
			}
			return walkErr
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		rel, err := filepath.Rel(h.uploadDir, path)
		if err != nil {
			return err
		}
		dest := filepath.Join(stage, rel)
		if info.IsDir() {
			return os.MkdirAll(dest, info.Mode().Perm())
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("上传目录包含非普通文件: %s", rel)
		}
		return os.Link(path, dest)
	})
	if err != nil {
		return false, err
	}
	for _, entry := range zr.File {
		rel, upload, err := uploadArchivePath(entry.Name)
		if err != nil {
			return false, err
		}
		if !upload {
			continue
		}
		if err := ctx.Err(); err != nil {
			return false, err
		}
		dest := filepath.Join(stage, rel)
		if entry.FileInfo().IsDir() {
			if err := os.MkdirAll(dest, 0755); err != nil {
				return false, err
			}
			continue
		}
		if !entry.Mode().IsRegular() {
			return false, fmt.Errorf("备份包含非普通上传文件: %s", entry.Name)
		}
		if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
			return false, err
		}
		src, err := entry.Open()
		if err != nil {
			return false, err
		}
		out, err := os.CreateTemp(filepath.Dir(dest), ".restore-*")
		if err != nil {
			src.Close()
			return false, err
		}
		n, copyErr := io.Copy(out, contextReader{ctx, io.LimitReader(src, int64(maxRestoreEntrySize)+1)})
		src.Close()
		if copyErr == nil && (n != int64(entry.UncompressedSize64) || n > int64(maxRestoreEntrySize)) {
			copyErr = fmt.Errorf("上传文件大小不匹配: %s", rel)
		}
		if copyErr == nil {
			copyErr = out.Chmod(0644)
		}
		if copyErr == nil {
			copyErr = out.Sync()
		}
		closeErr := out.Close()
		if copyErr == nil {
			copyErr = closeErr
		}
		if copyErr == nil {
			copyErr = os.Rename(out.Name(), dest)
		}
		if copyErr != nil {
			return false, copyErr
		}
	}
	// Persist new files and directory entries before publishing the journal.
	err = filepath.Walk(stage, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return syncRestoreDirectory(path)
		}
		return nil
	})
	if err != nil {
		return false, err
	}
	success = true
	return true, nil
}
