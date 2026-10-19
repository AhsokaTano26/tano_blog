package handler

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBackupHealthPreservesSuccessAfterFailureAndIgnoresRestoreFreshness(t *testing.T) {
	h := NewBackupHandler(nil, t.TempDir(), t.TempDir())
	_, finish, ok := h.beginOperation(context.Background(), "export")
	if !ok {
		t.Fatal("backup was not admitted")
	}
	if health := h.HealthSnapshot(); !health.Running || health.StartedAt == nil {
		t.Fatalf("running operation not visible: %+v", health)
	}
	finish(nil)
	first := h.HealthSnapshot()
	if first.LastSuccess == nil || first.LastFailure != nil || first.Running {
		t.Fatalf("completed backup health incorrect: %+v", first)
	}
	_, finish, _ = h.beginOperation(context.Background(), "export")
	finish(errors.New("postgres://secret@private-host/database"))
	failed := h.HealthSnapshot()
	if failed.LastFailure == nil || !failed.LastSuccess.Equal(*first.LastSuccess) || failed.LastResult != "failed" {
		t.Fatalf("failure must retain last known recovery point: %+v", failed)
	}
	raw, _ := json.Marshal(failed)
	if strings.Contains(string(raw), "secret") || strings.Contains(string(raw), "private-host") {
		t.Fatalf("backup health exposed the underlying error: %s", raw)
	}
	_, finish, _ = h.beginOperation(context.Background(), "validate")
	finish(nil)
	restored := h.HealthSnapshot()
	if !restored.LastSuccess.Equal(*first.LastSuccess) || restored.LastFailure == nil {
		t.Fatalf("restore must not make an old backup fresh or erase a failed backup: %+v", restored)
	}
}

func TestBackupHealthDiscoversOnlyCompletedOrdinaryArchivesAfterRestart(t *testing.T) {
	dir := t.TempDir()
	want := time.Now().Add(-2 * time.Hour).Truncate(time.Second)
	for _, name := range []string{"backup-2026-10-19T010000.zip", ".backup-incomplete.zip.tmp"} {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte("archive"), 0600); err != nil {
			t.Fatal(err)
		}
		if name[0] != '.' {
			if err := os.Chtimes(path, want, want); err != nil {
				t.Fatal(err)
			}
		}
	}
	h := NewBackupHandler(nil, t.TempDir(), dir)
	health := h.HealthSnapshot()
	if health.LastSuccess == nil || !health.LastSuccess.Equal(want) {
		t.Fatalf("restart should retain the completed archive timestamp: %+v", health)
	}
}
