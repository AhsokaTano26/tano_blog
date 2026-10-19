//go:build !linux && !darwin

package monitoring

func ProbeDisk(string) DiskStatus { return DiskStatus{Error: "disk_probe_unsupported"} }
