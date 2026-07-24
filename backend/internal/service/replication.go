package service

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/utils"
)

const (
	syncStatusKey      = "sync_last_status"
	syncMessageKey     = "sync_last_message"
	syncFinishedAtKey  = "sync_last_finished_at"
	syncSnapshotKey    = "sync_last_snapshot"
	syncScheduleRunKey = "sync_last_schedule_run"
	syncAttemptedAtKey = "sync_last_attempted_at"
)

var syncTargetRe = regexp.MustCompile(`^[A-Za-z0-9._-]+@[A-Za-z0-9._:-]+$`)

type ReplicationService struct {
	repo                 *repository.SiteConfigRepo
	backupDir            string
	uploadDir            string
	createSnapshot       func() (string, error)
	restoreSnapshot      func(string) error
	syncKeyEncryptionKey string
	mu                   sync.Mutex
	running              bool
}

type SyncStatus struct {
	Enabled       bool   `json:"enabled"`
	Role          string `json:"role"`
	ScheduleMode  string `json:"schedule_mode"`
	LastStatus    string `json:"last_status"`
	LastMessage   string `json:"last_message"`
	LastFinished  string `json:"last_finished_at"`
	LastSnapshot  string `json:"last_snapshot"`
	Running       bool   `json:"running"`
	HasPrivateKey bool   `json:"has_private_key"`
}

type syncSettings struct {
	enabled              bool
	role                 string
	scheduleMode         string
	interval             time.Duration
	weekdays             map[time.Weekday]bool
	timeOfDay            string
	timezone             *time.Location
	target               string
	keyPath              string
	privateKeyCiphertext string
	remoteBackup         string
	remoteUploads        string
	bandwidthKBps        int
}

func NewReplicationService(repo *repository.SiteConfigRepo, backupDir, uploadDir string, createSnapshot func() (string, error), restoreSnapshot func(string) error, syncKeyEncryptionKey string) *ReplicationService {
	if !filepath.IsAbs(uploadDir) {
		uploadDir, _ = filepath.Abs(uploadDir)
	}
	return &ReplicationService{repo: repo, backupDir: backupDir, uploadDir: uploadDir, createSnapshot: createSnapshot, restoreSnapshot: restoreSnapshot, syncKeyEncryptionKey: syncKeyEncryptionKey}
}

func (s *ReplicationService) GetStatus() SyncStatus {
	settings, values, _ := s.settings()
	s.mu.Lock()
	running := s.running
	s.mu.Unlock()
	return SyncStatus{Enabled: settings.enabled, Role: settings.role, ScheduleMode: settings.scheduleMode, LastStatus: values[syncStatusKey], LastMessage: values[syncMessageKey], LastFinished: values[syncFinishedAtKey], LastSnapshot: values[syncSnapshotKey], Running: running, HasPrivateKey: settings.privateKeyCiphertext != ""}
}

func (s *ReplicationService) RunNow(ctx context.Context) error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return fmt.Errorf("已有同步任务正在运行")
	}
	s.running = true
	s.mu.Unlock()
	defer func() { s.mu.Lock(); s.running = false; s.mu.Unlock() }()

	settings, _, err := s.settings()
	if err != nil {
		return s.finish("failed", err.Error(), "")
	}
	if !settings.enabled {
		return s.finish("skipped", "同步未启用", "")
	}
	_ = s.repo.Upsert(syncAttemptedAtKey, time.Now().UTC().Format(time.RFC3339), "string")

	if settings.role == "primary" {
		name, err := s.createSnapshot()
		if err != nil {
			return s.finish("failed", "创建同步快照失败: "+err.Error(), "")
		}
		return s.finish("success", "同步快照已生成，等待备机拉取", name)
	}
	if settings.role != "standby" {
		return s.finish("failed", "同步角色必须为 primary 或 standby", "")
	}
	if err := s.pullAndApply(ctx, settings); err != nil {
		return s.finish("failed", err.Error(), "")
	}
	return nil
}

func (s *ReplicationService) RunScheduled(ctx context.Context) {
	settings, values, err := s.settings()
	if err != nil || !settings.enabled || !s.isDue(settings, values) {
		return
	}
	if err := s.RunNow(ctx); err != nil {
		utils.LogWarn("replication task failed", "error", err)
	}
}

func (s *ReplicationService) isDue(settings syncSettings, values map[string]string) bool {
	now := time.Now().In(settings.timezone)
	if settings.scheduleMode == "weekly" {
		if !settings.weekdays[now.Weekday()] || now.Format("15:04") != settings.timeOfDay {
			return false
		}
		slot := now.Format("2006-01-02 15:04")
		if values[syncScheduleRunKey] == slot {
			return false
		}
		_ = s.repo.Upsert(syncScheduleRunKey, slot, "string")
		return true
	}
	last, err := time.Parse(time.RFC3339, values[syncAttemptedAtKey])
	return err != nil || time.Since(last) >= settings.interval
}

func (s *ReplicationService) pullAndApply(ctx context.Context, settings syncSettings) error {
	if !syncTargetRe.MatchString(settings.target) {
		return fmt.Errorf("SSH 目标格式无效，应为 user@host")
	}
	if !safeRemoteDir(settings.remoteBackup) || !safeRemoteDir(settings.remoteUploads) {
		return fmt.Errorf("远程目录必须是绝对路径且不能包含 ..")
	}

	incoming := filepath.Join(s.backupDir, "sync", "incoming")
	if err := os.MkdirAll(incoming, 0700); err != nil {
		return err
	}
	if err := s.rsync(ctx, settings, settings.remoteBackup, incoming, false); err != nil {
		return fmt.Errorf("拉取同步快照失败: %w", err)
	}
	snapshot, err := latestSnapshot(incoming)
	if err != nil {
		return err
	}
	_, values, _ := s.settings()
	if values[syncSnapshotKey] == snapshot {
		return s.finish("success", "已是最新快照", snapshot)
	}

	stage := s.uploadDir + ".sync-stage"
	if err := os.MkdirAll(stage, 0750); err != nil {
		return err
	}
	if err := s.rsync(ctx, settings, settings.remoteUploads, stage, true); err != nil {
		return fmt.Errorf("拉取上传文件失败: %w", err)
	}
	if err := s.restoreSnapshot(filepath.Join(incoming, snapshot)); err != nil {
		return fmt.Errorf("应用数据库快照失败: %w", err)
	}
	if err := swapDirectories(s.uploadDir, stage); err != nil {
		return fmt.Errorf("切换上传文件失败: %w", err)
	}
	return s.finish("success", "同步完成", snapshot)
}

func (s *ReplicationService) rsync(ctx context.Context, settings syncSettings, remoteDir, localDir string, delete bool) error {
	ssh := "ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15"
	if settings.privateKeyCiphertext != "" {
		privateKey, err := utils.DecryptSyncSecret(s.syncKeyEncryptionKey, settings.privateKeyCiphertext)
		if err != nil {
			return err
		}
		keyFile, err := os.CreateTemp("", "tano-sync-key-*")
		if err != nil {
			return fmt.Errorf("创建临时 SSH 私钥失败: %w", err)
		}
		keyPath := keyFile.Name()
		defer os.Remove(keyPath)
		if err := keyFile.Chmod(0600); err != nil {
			keyFile.Close()
			return fmt.Errorf("设置临时 SSH 私钥权限失败: %w", err)
		}
		if _, err := keyFile.WriteString(privateKey); err != nil {
			keyFile.Close()
			return fmt.Errorf("写入临时 SSH 私钥失败: %w", err)
		}
		if err := keyFile.Close(); err != nil {
			return fmt.Errorf("关闭临时 SSH 私钥失败: %w", err)
		}
		ssh += " -i " + keyPath
	} else if settings.keyPath != "" {
		if !filepath.IsAbs(settings.keyPath) || strings.ContainsAny(settings.keyPath, "\n\r") {
			return fmt.Errorf("SSH 私钥路径无效")
		}
		ssh += " -i " + settings.keyPath
	}
	// --append-verify 负责断点续传和完整性校验；它与 --delay-updates
	// 互斥。上传目录会在传输完成后由 swapDirectories 原子切换。
	args := []string{"-az", "--partial", "--append-verify", "--protect-args", "--timeout=60", "--contimeout=15", "-e", ssh}
	if settings.bandwidthKBps > 0 {
		args = append(args, "--bwlimit="+strconv.Itoa(settings.bandwidthKBps))
	}
	if delete {
		args = append(args, "--delete-delay")
	}
	args = append(args, settings.target+":"+strings.TrimRight(remoteDir, "/")+"/", strings.TrimRight(localDir, "/")+"/")
	cmd := exec.CommandContext(ctx, "rsync", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func (s *ReplicationService) finish(status, message, snapshot string) error {
	_ = s.repo.Upsert(syncStatusKey, status, "string")
	_ = s.repo.Upsert(syncMessageKey, message, "string")
	_ = s.repo.Upsert(syncFinishedAtKey, time.Now().UTC().Format(time.RFC3339), "string")
	if snapshot != "" {
		_ = s.repo.Upsert(syncSnapshotKey, snapshot, "string")
	}
	if status == "failed" {
		return fmt.Errorf("%s", message)
	}
	return nil
}

func (s *ReplicationService) settings() (syncSettings, map[string]string, error) {
	configs, err := s.repo.GetAll()
	values := map[string]string{}
	for _, cfg := range configs {
		values[cfg.Key] = cfg.Value
	}
	loc, err := time.LoadLocation(defaultValue(values["sync_timezone"], "Asia/Shanghai"))
	if err != nil {
		loc = time.Local
	}
	minutes, _ := strconv.Atoi(values["sync_interval_minutes"])
	if minutes < 5 {
		minutes = 5
	}
	if minutes > 10080 {
		minutes = 10080
	}
	bandwidth, _ := strconv.Atoi(values["sync_bandwidth_kbps"])
	weekdays := map[time.Weekday]bool{}
	for _, day := range strings.Split(values["sync_weekdays"], ",") {
		if value, parseErr := strconv.Atoi(strings.TrimSpace(day)); parseErr == nil && value >= 0 && value <= 6 {
			weekdays[time.Weekday(value)] = true
		}
	}
	if len(weekdays) == 0 {
		weekdays[time.Monday] = true
	}
	timeOfDay := defaultValue(values["sync_time_of_day"], "02:00")
	if _, parseErr := time.Parse("15:04", timeOfDay); parseErr != nil {
		timeOfDay = "02:00"
	}
	return syncSettings{enabled: values["sync_enabled"] == "true", role: defaultValue(values["sync_role"], "standby"), scheduleMode: defaultValue(values["sync_schedule_mode"], "interval"), interval: time.Duration(minutes) * time.Minute, weekdays: weekdays, timeOfDay: timeOfDay, timezone: loc, target: values["sync_ssh_target"], keyPath: values["sync_ssh_key_path"], privateKeyCiphertext: values["sync_ssh_private_key_enc"], remoteBackup: defaultValue(values["sync_remote_backup_dir"], "/data/backups/sync"), remoteUploads: defaultValue(values["sync_remote_upload_dir"], "/data/uploads"), bandwidthKBps: bandwidth}, values, err
}

func latestSnapshot(dir string) (string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", err
	}
	var snapshots []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasPrefix(entry.Name(), "sync-") && strings.HasSuffix(entry.Name(), ".zip") {
			snapshots = append(snapshots, entry.Name())
		}
	}
	if len(snapshots) == 0 {
		return "", fmt.Errorf("主服务器没有可用同步快照")
	}
	sort.Strings(snapshots)
	return snapshots[len(snapshots)-1], nil
}

func safeRemoteDir(path string) bool {
	return strings.HasPrefix(path, "/") && !strings.Contains(path, "..") && !strings.ContainsAny(path, "\n\r")
}
func defaultValue(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func swapDirectories(current, stage string) error {
	old := current + ".sync-old"
	if current == "/" || stage == "/" || !filepath.IsAbs(current) {
		return fmt.Errorf("上传目录必须为安全的绝对路径")
	}
	_ = os.RemoveAll(old)
	if _, err := os.Stat(current); err == nil {
		if err := os.Rename(current, old); err != nil {
			return err
		}
	}
	if err := os.Rename(stage, current); err != nil {
		_ = os.Rename(old, current)
		return err
	}
	return os.RemoveAll(old)
}
