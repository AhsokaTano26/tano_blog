package monitoring

import (
	"math"
	"os"
	"sort"
	"strconv"
	"time"
)

type Config struct {
	MinRequests        uint64  `json:"min_requests"`
	ErrorRate          float64 `json:"error_rate"`
	P95MS              float64 `json:"p95_ms"`
	DiskMinFreeBytes   uint64  `json:"disk_min_free_bytes"`
	DiskMinFreePercent float64 `json:"disk_min_free_percent"`
	BackupMaxAgeHours  float64 `json:"backup_max_age_hours"`
}

func DefaultConfig() Config {
	return Config{MinRequests: 20, ErrorRate: 0.05, P95MS: 1000, DiskMinFreeBytes: 1 << 30, DiskMinFreePercent: 10, BackupMaxAgeHours: 48}
}

func LoadConfig() Config {
	c := DefaultConfig()
	c.MinRequests = uint64(boundedEnv("MONITOR_MIN_REQUESTS", float64(c.MinRequests), 1, 1000000))
	c.ErrorRate = boundedEnv("MONITOR_ERROR_RATE_PERCENT", c.ErrorRate*100, 0.01, 100) / 100
	c.P95MS = boundedEnv("MONITOR_P95_MS", c.P95MS, 1, 1800000)
	c.DiskMinFreeBytes = uint64(boundedEnv("MONITOR_DISK_MIN_FREE_GIB", float64(c.DiskMinFreeBytes)/(1<<30), 0, 1048576) * (1 << 30))
	c.DiskMinFreePercent = boundedEnv("MONITOR_DISK_MIN_FREE_PERCENT", c.DiskMinFreePercent, 0, 100)
	c.BackupMaxAgeHours = boundedEnv("MONITOR_BACKUP_MAX_AGE_HOURS", c.BackupMaxAgeHours, 1, 87600)
	return c
}

func boundedEnv(name string, fallback, low, high float64) float64 {
	value, err := strconv.ParseFloat(os.Getenv(name), 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) || value < low || value > high {
		return fallback
	}
	return value
}

type BackupHealth struct {
	Running        bool       `json:"running"`
	Kind           string     `json:"kind"`
	Phase          string     `json:"phase"`
	StartedAt      *time.Time `json:"started_at"`
	LastResult     string     `json:"last_result"`
	LastSuccess    *time.Time `json:"last_success"`
	LastFailure    *time.Time `json:"last_failure"`
	SuccessSource  string     `json:"success_source"`
	DiscoveryError string     `json:"discovery_error,omitempty"`
}

type DiskStatus struct {
	AvailableBytes   uint64  `json:"available_bytes"`
	TotalBytes       uint64  `json:"total_bytes"`
	AvailablePercent float64 `json:"available_percent"`
	Error            string  `json:"error,omitempty"`
}

type Alert struct {
	Code     string `json:"code"`
	Severity string `json:"severity"`
	Message  string `json:"message"`
	Action   string `json:"action"`
}

// EvaluateAlerts produces local, actionable findings only. It sends no network
// notifications, and never includes database errors, paths or backup contents.
func EvaluateAlerts(cfg Config, requests RequestSnapshot, disks map[string]DiskStatus, backup BackupHealth, now time.Time) []Alert {
	alerts := make([]Alert, 0)
	add := func(code, message, action string) {
		alerts = append(alerts, Alert{Code: code, Severity: "warning", Message: message, Action: action})
	}
	if requests.Requests >= cfg.MinRequests {
		if requests.ErrorRate != nil && *requests.ErrorRate >= cfg.ErrorRate {
			add("request_error_rate", "Request 5xx error rate reached the configured threshold.", "Inspect route totals and server logs; check database connectivity and recent changes.")
		}
		if requests.P95MS != nil && (*requests.P95MS >= cfg.P95MS || requests.P95Overflow) {
			add("request_latency", "Request p95 latency reached the configured threshold.", "Inspect slow route histograms, database pool waits and active backup or upload work.")
		}
	}
	names := make([]string, 0, len(disks))
	for name := range disks {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		disk := disks[name]
		if disk.Error != "" {
			add("disk_probe_"+name, "Storage capacity could not be measured for "+name+".", "Check that the configured directory exists, is mounted and is accessible to the server process.")
		} else if disk.AvailableBytes < cfg.DiskMinFreeBytes || disk.AvailablePercent < cfg.DiskMinFreePercent {
			add("disk_low_"+name, "Storage available to the server is below the configured threshold for "+name+".", "Expand the volume or remove verified expendable files; keep a verified backup before deleting archives.")
		}
	}
	if backup.DiscoveryError != "" {
		add("backup_probe_failed", "Completed backup archives could not be inspected at startup.", "Check backup directory access and restart after correcting it; create and verify a full backup.")
	}
	if backup.LastFailure != nil && (backup.LastSuccess == nil || !backup.LastFailure.Before(*backup.LastSuccess)) {
		add("backup_failed", "The latest full backup attempt failed or was cancelled.", "Inspect backup status and server logs, check disk capacity, then create a new full backup and run a recovery drill.")
	}
	if backup.LastSuccess == nil {
		add("backup_missing", "No completed full backup is known.", "Create a full backup from the admin backup page and verify it with an isolated recovery drill.")
	} else if now.Sub(*backup.LastSuccess).Hours() >= cfg.BackupMaxAgeHours {
		add("backup_stale", "The latest known full backup is older than the configured maximum age.", "Create and verify a fresh full backup; check the external backup schedule if one is configured.")
	}
	return alerts
}
