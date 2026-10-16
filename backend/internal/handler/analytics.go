package handler

import (
	"context"
	"github.com/gin-gonic/gin"
	"net/http"
	"sync"
	"tano_blog/backend/internal/repository"
	"time"
)

type analyticsEntry struct {
	expires time.Time
	data    *repository.Analytics
}
type analyticsCache struct {
	sync.Mutex
	entries map[string]analyticsEntry
}

func (cache *analyticsCache) lockContext(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if cache.TryLock() {
		return nil
	}
	// A canceled dashboard request must not remain queued behind a slow query.
	// TryLock avoids spawning an unbounded set of goroutines to wait on Mutex.
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if err := ctx.Err(); err != nil {
				return err
			}
			if cache.TryLock() {
				return nil
			}
		}
	}
}

func (h *AccessLogHandler) analytics(c *gin.Context) (*repository.Analytics, error) {
	start, end, err := repository.AnalyticsRange(c.Query("start"), c.Query("end"), time.Now())
	if err != nil {
		return nil, err
	}
	key := start.String() + end.String()
	// The shared lock coalesces concurrent dashboard requests on a cache miss.
	if err := h.cache.lockContext(c.Request.Context()); err != nil {
		return nil, err
	}
	defer h.cache.Unlock()
	if entry, ok := h.cache.entries[key]; ok && time.Now().Before(entry.expires) {
		return entry.data, nil
	}
	data, err := h.repo.WithContext(c.Request.Context()).Overview(start, end)
	if err != nil {
		return nil, err
	}
	if len(h.cache.entries) >= 16 {
		h.cache.entries = map[string]analyticsEntry{}
	}
	h.cache.entries[key] = analyticsEntry{time.Now().Add(15 * time.Second), data}
	return data, nil
}

func (h *AccessLogHandler) Overview(c *gin.Context) {
	data, err := h.analytics(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "统计失败，请检查日期范围（最多366天）"})
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.JSON(http.StatusOK, data)
}

// Summary fetches counts only, never comment bodies, full link lists or media.
func (h *SiteConfigHandler) Summary(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	var result struct {
		Posts           int64 `json:"posts"`
		Comments        int64 `json:"comments"`
		Media           int64 `json:"media"`
		Categories      int64 `json:"categories"`
		Tags            int64 `json:"tags"`
		PendingComments int64 `json:"pending_comments"`
		PendingLinks    int64 `json:"pending_links"`
	}
	err := h.db.Raw(`SELECT (SELECT COUNT(*) FROM posts) AS posts,
  (SELECT COUNT(*) FROM comments) AS comments, (SELECT COUNT(*) FROM media) AS media,
  (SELECT COUNT(*) FROM categories) AS categories, (SELECT COUNT(*) FROM tags) AS tags,
  (SELECT COUNT(*) FROM comments WHERE status='pending') AS pending_comments,
  (SELECT COUNT(*) FROM friend_links WHERE status='pending') AS pending_links`).Scan(&result).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取概览失败"})
		return
	}
	c.JSON(http.StatusOK, result)
}
