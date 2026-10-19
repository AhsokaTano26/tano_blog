package handler

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	"tano_blog/backend/internal/monitoring"
)

// discoverBackupHealth recovers freshness at startup from completed ordinary
// archive mtimes. It does not certify archive integrity: the recovery drill does.
func (h *BackupHandler) discoverBackupHealth() {
	h.health.LastResult = "unknown"
	entries, err := os.ReadDir(h.backupDir)
	if err != nil {
		h.health.DiscoveryError = "backup_scan_failed"
		return
	}
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), "backup-") || !strings.HasSuffix(entry.Name(), ".zip") {
			continue
		}
		info, err := os.Lstat(filepath.Join(h.backupDir, entry.Name()))
		if err != nil {
			h.health.DiscoveryError = "backup_scan_failed"
			continue
		}
		if !info.Mode().IsRegular() || info.Size() == 0 {
			continue
		}
		modified := info.ModTime().UTC()
		if h.health.LastSuccess == nil || modified.After(*h.health.LastSuccess) {
			h.health.LastSuccess = &modified
			h.health.SuccessSource = "archive_mtime"
		}
	}
}

func (h *BackupHandler) HealthSnapshot() monitoring.BackupHealth {
	h.operationMu.Lock()
	defer h.operationMu.Unlock()
	status := h.health
	status.Running = h.operation.Running
	status.Phase = h.operation.Phase
	return status
}

func (h *BackupHandler) startHealth(phase string) {
	started := time.Now().UTC()
	h.health.StartedAt = &started
	switch phase {
	case "export":
		h.health.Kind = "backup"
	case "snapshot":
		h.health.Kind = "snapshot"
	case "clear":
		h.health.Kind = "clear"
	default:
		h.health.Kind = "restore"
	}
}

func (h *BackupHandler) finishHealth(initialPhase string, err error) {
	h.health.LastResult = h.operation.Phase
	// A restored database or a database-only replication snapshot cannot renew
	// the freshness of a self-contained database-and-media backup.
	if initialPhase != "export" {
		return
	}
	finished := time.Now().UTC()
	if err == nil {
		h.health.LastSuccess = &finished
		h.health.SuccessSource = "completed_operation"
		h.health.DiscoveryError = ""
	} else {
		h.health.LastFailure = &finished
	}
}
