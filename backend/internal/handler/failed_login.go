package handler

import (
	"sync"
	"time"

	"gorm.io/gorm"

	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
)

type failedLoginCounter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
}

var flc = &failedLoginCounter{attempts: make(map[string][]time.Time)}

func (f *failedLoginCounter) add(ip string, window time.Duration) int {
	now := time.Now()
	f.mu.Lock()
	defer f.mu.Unlock()
	cutoff := now.Add(-window)
	var valid []time.Time
	for _, t := range f.attempts[ip] {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}
	valid = append(valid, now)
	f.attempts[ip] = valid
	return len(valid)
}

func (f *failedLoginCounter) reset(ip string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.attempts, ip)
}

func checkAutoBan(db *gorm.DB, ip string) {
	configRepo := repository.NewSiteConfigRepo(db)
	autoEnabled, _ := configRepo.Get("ip_ban_auto_enabled")
	if autoEnabled != "true" {
		return
	}

	thresholdStr, _ := configRepo.Get("ip_ban_auto_threshold")
	windowStr, _ := configRepo.Get("ip_ban_auto_window")
	scopeStr, _ := configRepo.Get("ip_ban_auto_scope")
	durationStr, _ := configRepo.Get("ip_ban_auto_duration")

	threshold := parseInt(thresholdStr, 10)
	windowSec := parseInt(windowStr, 300)
	scope := scopeStr
	if scope == "" {
		scope = "login"
	}
	durationSec := parseInt(durationStr, 1800)

	count := flc.add(ip, time.Duration(windowSec)*time.Second)
	if count >= threshold {
		expiresAt := time.Now().Add(time.Duration(durationSec) * time.Second)
		ban := &model.IPBan{
			IPAddress: ip,
			Scope:     scope,
			Reason:    "登录失败次数过多，自动封禁",
			AutoBan:   true,
			ExpiresAt: &expiresAt,
		}
		ipBanRepo := repository.NewIPBanRepo(db)
		_ = ipBanRepo.Create(ban)
	}
}
