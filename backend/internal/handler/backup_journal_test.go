//go:build unix

package handler

import (
	"context"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

func TestPrepareRestoreJournalWriteFailureLeavesNoJournal(t *testing.T) {
	const helperEnv = "TANO_BLOG_JOURNAL_WRITE_FAILURE_HELPER"
	const uploadEnv = "TANO_BLOG_JOURNAL_WRITE_FAILURE_UPLOAD_DIR"
	if os.Getenv(helperEnv) == "1" {
		// Limit only the helper process: force a real partial file write without
		// changing the resource limits of the process running the other tests.
		signal.Ignore(unix.SIGXFSZ)
		if err := unix.Setrlimit(unix.RLIMIT_FSIZE, &unix.Rlimit{Cur: 8, Max: 8}); err != nil {
			t.Fatal(err)
		}
		h := &BackupHandler{uploadDir: os.Getenv(uploadEnv)}
		if _, err := h.prepareRestoreJournal(); err == nil {
			t.Fatal("journal preparation succeeded despite the file size limit")
		}
		return
	}

	root := t.TempDir()
	uploadDir := filepath.Join(root, "uploads")
	if err := os.Mkdir(uploadDir, 0700); err != nil {
		t.Fatal(err)
	}
	original := filepath.Join(uploadDir, "image.txt")
	if err := os.WriteFile(original, []byte("original-upload"), 0600); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestPrepareRestoreJournalWriteFailureLeavesNoJournal$", "-test.count=1")
	cmd.Env = append(os.Environ(), helperEnv+"=1", uploadEnv+"="+uploadDir)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("journal write failure helper: %v (deadline: %v)\n%s", err, ctx.Err(), output)
	}

	if _, err := os.Lstat(uploadDir + ".restore-journal.json"); !os.IsNotExist(err) {
		t.Errorf("failed journal write left a published journal: %v", err)
	}
	if data, err := os.ReadFile(original); err != nil || string(data) != "original-upload" {
		t.Errorf("failed journal preparation changed uploads: %q, %v", data, err)
	}
	h := &BackupHandler{uploadDir: uploadDir}
	if err := h.RecoverInterruptedRestore(); err != nil {
		t.Errorf("failed journal preparation poisoned restart recovery: %v", err)
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() != "uploads" {
			t.Errorf("failed journal preparation left an artifact: %s", entry.Name())
		}
	}
}

func TestPrepareRestoreJournalPreservesExistingJournal(t *testing.T) {
	root := t.TempDir()
	uploadDir := filepath.Join(root, "uploads")
	path := uploadDir + ".restore-journal.json"
	const original = `{"id":"unresolved-restore","had_uploads":true}`
	if err := os.WriteFile(path, []byte(original), 0600); err != nil {
		t.Fatal(err)
	}

	h := &BackupHandler{uploadDir: uploadDir}
	if _, err := h.prepareRestoreJournal(); !os.IsExist(err) {
		t.Fatalf("existing restore journal was not rejected: %v", err)
	}
	if data, err := os.ReadFile(path); err != nil || string(data) != original {
		t.Errorf("existing restore journal was changed: %q, %v", data, err)
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() != "uploads.restore-journal.json" {
			t.Errorf("rejected journal preparation left an artifact: %s", entry.Name())
		}
	}
}
