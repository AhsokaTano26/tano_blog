package handler

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"tano_blog/backend/internal/model"
)

func (h *BackupHandler) clearAllDataContext(ctx context.Context) error {
	if h.acquireBackupGate != nil {
		release, err := h.acquireBackupGate(ctx)
		if err != nil {
			return err
		}
		defer release()
	}
	// Promotion can change while the request waits for existing writers.
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
	if err := h.RecoverInterruptedRestoreContext(ctx); err != nil {
		return err
	}
	h.progress("files", "", 0, 0)
	if err := h.stageClearUploads(ctx); err != nil {
		return fmt.Errorf("暂存清空上传目录失败: %w", err)
	}
	defer func() {
		// An unresolved journal owns all recovery material until its marker can
		// be checked. Before publication the stage is disposable.
		if _, err := os.Stat(h.uploadDir + ".restore-journal.json"); os.IsNotExist(err) {
			_ = os.RemoveAll(h.uploadDir + ".restore-stage")
		}
	}()
	// Keep cancellation available until the shared finalization boundary, but
	// do not let database/sql automatically roll back after that boundary.
	tx := h.db.WithContext(context.WithoutCancel(ctx)).Begin().WithContext(ctx)
	if tx.Error != nil {
		return tx.Error
	}
	defer tx.Rollback()
	h.progress("clear", "", 0, 0)
	for _, table := range truncateOrder {
		if clearSkipTables[table] {
			continue
		}
		if err := tx.Exec("TRUNCATE TABLE " + table + " CASCADE").Error; err != nil {
			return fmt.Errorf("清空表 %s 失败: %w", table, err)
		}
	}
	if tx.Migrator().HasTable("media_file_cleanups") {
		if err := tx.Exec("DELETE FROM media_file_cleanups").Error; err != nil {
			return err
		}
	}
	return h.commitRestoreTransaction(ctx, tx, true)
}

// Keep pinned transfer sources in the new tree while ordinary uploads remain
// only in the journal's rollback tree until the database outcome is resolved.
func (h *BackupHandler) stageClearUploads(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	entries, err := os.ReadDir(h.uploadDir)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	stage := h.uploadDir + ".restore-stage"
	if err := os.RemoveAll(stage); err != nil {
		return err
	}
	if err := os.Mkdir(stage, 0750); err != nil {
		return err
	}
	success := false
	defer func() {
		if !success {
			_ = os.RemoveAll(stage)
		}
	}()
	for _, entry := range entries {
		if entry.Name() != ".sync-snapshots" {
			continue
		}
		if err := filepath.Walk(filepath.Join(h.uploadDir, entry.Name()), func(path string, info os.FileInfo, walkErr error) error {
			if walkErr != nil {
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
				return fmt.Errorf("冻结快照包含非普通文件: %s", rel)
			}
			return os.Link(path, dest)
		}); err != nil {
			return err
		}
	}
	if err := filepath.Walk(stage, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if info.IsDir() {
			return syncRestoreDirectory(path)
		}
		return nil
	}); err != nil {
		return err
	}
	success = true
	return nil
}
