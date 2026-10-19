package monitoring

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestAlertsRequireTrafficAndReportDiskAndBackupFailures(t *testing.T) {
	now := time.Now()
	recent := now.Add(-time.Hour)
	failed := now.Add(-time.Minute)
	healthyDisk := DiskStatus{AvailableBytes: 20 << 30, TotalBytes: 100 << 30, AvailablePercent: 20}
	r := NewRecorder()
	cfg := DefaultConfig()
	backup := BackupHealth{LastSuccess: &recent}
	if alerts := EvaluateAlerts(cfg, r.Snapshot(now), map[string]DiskStatus{"uploads": healthyDisk}, backup, now); len(alerts) != 0 {
		t.Fatalf("idle requests must not alert: %+v", alerts)
	}
	for range 20 {
		r.Observe("GET", "/posts", 500, 2*time.Second, now)
	}
	backup.LastFailure = &failed
	disks := map[string]DiskStatus{
		"uploads": {AvailableBytes: 500 << 20, TotalBytes: 100 << 30, AvailablePercent: 0.5},
		"backups": {Error: "disk_probe_failed"},
	}
	alerts := EvaluateAlerts(cfg, r.Snapshot(now), disks, backup, now)
	want := map[string]bool{"request_error_rate": false, "request_latency": false, "disk_low_uploads": false, "disk_probe_backups": false, "backup_failed": false}
	for _, alert := range alerts {
		if _, ok := want[alert.Code]; ok {
			want[alert.Code] = true
		}
		if alert.Action == "" {
			t.Fatalf("alert must give a local action: %+v", alert)
		}
	}
	for code, found := range want {
		if !found {
			t.Errorf("missing %s from %+v", code, alerts)
		}
	}
}

func TestBackupFreshnessIsUnknownUntilSuccessfulAndStaleAtThreshold(t *testing.T) {
	now := time.Now()
	cfg := DefaultConfig()
	r := NewRecorder()
	for _, tc := range []struct {
		name string
		last *time.Time
		code string
	}{
		{name: "never", code: "backup_missing"},
		{name: "stale", last: timePointer(now.Add(-48 * time.Hour)), code: "backup_stale"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			alerts := EvaluateAlerts(cfg, r.Snapshot(now), nil, BackupHealth{LastSuccess: tc.last}, now)
			if len(alerts) != 1 || alerts[0].Code != tc.code {
				t.Fatalf("backup freshness must be actionable: %+v", alerts)
			}
		})
	}
}

func TestAlertThresholdBoundariesAndMinimumTraffic(t *testing.T) {
	now := time.Now()
	cfg := DefaultConfig()
	backup := BackupHealth{LastSuccess: timePointer(now)}
	r := NewRecorder()
	// One 5xx out of twenty requests is exactly the default 5% boundary.
	r.Observe("GET", "/posts", 503, time.Millisecond, now)
	for range 18 {
		r.Observe("GET", "/posts", 200, time.Millisecond, now)
	}
	if alerts := EvaluateAlerts(cfg, r.Snapshot(now), nil, backup, now); len(alerts) != 0 {
		t.Fatalf("less than the configured sample count must not trigger traffic alerts: %+v", alerts)
	}
	r.Observe("GET", "/posts", 200, time.Millisecond, now)
	alerts := EvaluateAlerts(cfg, r.Snapshot(now), nil, backup, now)
	if len(alerts) != 1 || alerts[0].Code != "request_error_rate" {
		t.Fatalf("the exact 5%% boundary must alert: %+v", alerts)
	}
	disks := map[string]DiskStatus{"uploads": {AvailableBytes: 1 << 30, TotalBytes: 10 << 30, AvailablePercent: 10}}
	if alerts := EvaluateAlerts(cfg, NewRecorder().Snapshot(now), disks, backup, now); len(alerts) != 0 {
		t.Fatalf("storage exactly at the minimum is not below it: %+v", alerts)
	}
	failed := now.Add(-time.Minute)
	backup.LastFailure = &failed
	if alerts := EvaluateAlerts(cfg, NewRecorder().Snapshot(now), disks, backup, now); len(alerts) != 0 {
		t.Fatalf("a newer successful backup must resolve the failure alert: %+v", alerts)
	}
}

func timePointer(t time.Time) *time.Time { return &t }

func TestDiskProbeErrorsAreVisibleWithoutLeakingPaths(t *testing.T) {
	dir := t.TempDir()
	status := ProbeDisk(dir)
	if status.Error != "" || status.TotalBytes == 0 || status.AvailableBytes > status.TotalBytes {
		t.Fatalf("existing directory must produce usable capacity: %+v", status)
	}
	missing := filepath.Join(dir, "private-name-not-for-metrics")
	status = ProbeDisk(missing)
	if status.Error != "disk_probe_failed" {
		t.Fatalf("missing storage must not report healthy: %+v", status)
	}
	encoded, _ := json.Marshal(status)
	if strings.Contains(string(encoded), dir) || strings.Contains(string(encoded), "private-name") {
		t.Fatalf("disk error leaked a local path: %s", encoded)
	}
	if err := os.WriteFile(filepath.Join(dir, "file"), []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	if status := ProbeDisk(filepath.Join(dir, "file")); status.Error == "" {
		t.Fatalf("a storage path that is a file is not a usable directory: %+v", status)
	}
}

func TestConfigRejectsUnsafeThresholds(t *testing.T) {
	t.Setenv("MONITOR_ERROR_RATE_PERCENT", "NaN")
	t.Setenv("MONITOR_P95_MS", "-1")
	t.Setenv("MONITOR_DISK_MIN_FREE_GIB", "Infinity")
	t.Setenv("MONITOR_DISK_MIN_FREE_PERCENT", "101")
	t.Setenv("MONITOR_BACKUP_MAX_AGE_HOURS", "0")
	t.Setenv("MONITOR_MIN_REQUESTS", "100000000000")
	if got, want := LoadConfig(), DefaultConfig(); got != want {
		t.Fatalf("invalid values must fall back to usable thresholds: got %+v want %+v", got, want)
	}
	t.Setenv("MONITOR_ERROR_RATE_PERCENT", "2.5")
	t.Setenv("MONITOR_DISK_MIN_FREE_GIB", "2")
	got := LoadConfig()
	if got.ErrorRate != 0.025 || got.DiskMinFreeBytes != 2<<30 {
		t.Fatalf("documented percent and GiB units were not converted: %+v", got)
	}
}
