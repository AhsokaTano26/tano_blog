package handler

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Only the newest database archive is advertised. After an archive is removed,
// its frozen upload tree remains available for 48 hours. Replication limits the
// entire snapshot + media pull to 24 hours, so an in-flight consumer can finish
// even across arbitrarily many new snapshots. Time starts at retirement, not
// creation: weekly schedules must provide the same guarantee as minute ones.
const syncSourceRetirementGrace = 48 * time.Hour

func (h *BackupHandler) retireSyncUploadSources(current string, now time.Time) error {
	root := filepath.Join(h.uploadDir, ".sync-snapshots")
	entries, err := os.ReadDir(root)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(entry.Name(), "sync-") || entry.Name() == current {
			continue
		}
		dir := filepath.Join(root, entry.Name())
		marker := filepath.Join(dir, ".retired-at")
		file, err := os.OpenFile(marker, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0640)
		if err == nil {
			if err = file.Close(); err != nil {
				return err
			}
			continue
		}
		if !os.IsExist(err) {
			return fmt.Errorf("记录同步源保留期限失败: %w", err)
		}
		info, err := os.Stat(marker)
		if err != nil {
			return err
		}
		if now.Sub(info.ModTime()) >= syncSourceRetirementGrace {
			if err := os.RemoveAll(dir); err != nil {
				return err
			}
		}
	}
	return nil
}
