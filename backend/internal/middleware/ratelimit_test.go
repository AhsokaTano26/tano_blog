package middleware

import (
	"testing"
	"time"
)

func TestRateLimiterFixedWindowRecoversUnderContinuousRequests(t *testing.T) {
	rl := &RateLimiter{visitors: make(map[string]*visitor), limit: 2, window: time.Minute}
	start := time.Date(2026, 10, 18, 0, 0, 0, 0, time.UTC)
	for _, step := range []struct {
		elapsed time.Duration
		allowed bool
	}{
		{0, true}, {10 * time.Second, true}, {20 * time.Second, false},
		{59 * time.Second, false}, {time.Minute, true},
		{70 * time.Second, true}, {80 * time.Second, false}, {2 * time.Minute, true},
	} {
		if got := rl.allowAt("client", start.Add(step.elapsed)); got != step.allowed {
			t.Fatalf("at %s: allowed=%v, want %v", step.elapsed, got, step.allowed)
		}
	}
}

func TestRateLimiterSeparatesClientsAndBoundsDeniedCounter(t *testing.T) {
	rl := &RateLimiter{visitors: make(map[string]*visitor), limit: 1, window: time.Minute}
	start := time.Now()
	if !rl.allowAt("first", start) || !rl.allowAt("second", start) {
		t.Fatal("independent clients must each receive their quota")
	}
	for range 1000 {
		if rl.allowAt("first", start.Add(time.Second)) {
			t.Fatal("denied requests cannot acquire more quota in the same window")
		}
	}
	if rl.visitors["first"].count != 1 {
		t.Fatal("denials must not increase the counter indefinitely")
	}
}
