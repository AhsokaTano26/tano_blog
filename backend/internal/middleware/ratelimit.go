package middleware

// RateLimiter provides a simple in-memory rate limiter keyed by IP address.
// IMPORTANT: This is a per-instance in-process limiter and does not scale
// across multiple backend instances. For distributed deployments, replace
// with a shared store (e.g. Redis). Additionally, the visitor map is cleaned
// every 10 minutes but entries for active IPs persist beyond the window.
// Current implementation is suitable for single-instance deployments under
// moderate traffic.

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type RateLimiter struct {
	visitors map[string]*visitor
	mu       sync.Mutex
	limit    int
	window   time.Duration
}

type visitor struct {
	count       int
	windowStart time.Time
	lastSeen    time.Time
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*visitor),
		limit:    limit,
		window:   window,
	}
	go rl.cleanup()
	return rl
}

func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(10 * time.Minute)
	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()
		for k, v := range rl.visitors {
			if now.Sub(v.lastSeen) > rl.window {
				delete(rl.visitors, k)
			}
		}
		rl.mu.Unlock()
	}
}

func (rl *RateLimiter) Allow(ip string) bool {
	return rl.allowAt(ip, time.Now())
}

func (rl *RateLimiter) allowAt(ip string, now time.Time) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	if rl.limit <= 0 {
		return false
	}
	v, ok := rl.visitors[ip]
	if !ok {
		rl.visitors[ip] = &visitor{count: 1, windowStart: now, lastSeen: now}
		return true
	}
	// Activity controls cleanup only. In particular, denied requests cannot
	// move the quota boundary and lock a continuously active client out forever.
	v.lastSeen = now
	if now.Sub(v.windowStart) >= rl.window {
		v.count = 1
		v.windowStart = now
		return true
	}
	if v.count >= rl.limit {
		return false
	}
	v.count++
	return true
}

func RateLimit(limit int, window time.Duration) gin.HandlerFunc {
	rl := NewRateLimiter(limit, window)
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !rl.Allow(ip) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "请求过于频繁，请稍后再试"})
			return
		}
		c.Next()
	}
}
