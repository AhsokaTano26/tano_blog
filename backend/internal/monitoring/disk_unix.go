//go:build linux || darwin

package monitoring

import (
	"os"
	"syscall"
)

// ProbeDisk uses space available to the service user, excluding reserved blocks.
// Errors intentionally expose only a stable code, never an installation path.
func ProbeDisk(path string) DiskStatus {
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return DiskStatus{Error: "disk_probe_failed"}
	}
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil || stat.Blocks == 0 || stat.Bsize <= 0 {
		return DiskStatus{Error: "disk_probe_failed"}
	}
	available, total := uint64(stat.Bavail)*uint64(stat.Bsize), uint64(stat.Blocks)*uint64(stat.Bsize)
	return DiskStatus{AvailableBytes: available, TotalBytes: total, AvailablePercent: 100 * float64(available) / float64(total)}
}
