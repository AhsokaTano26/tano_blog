package middleware

import (
	"context"
	"gorm.io/gorm"
	"strings"
	"sync"
	"sync/atomic"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/utils"
	"time"
)

type AccessLogWriter struct {
	queue   chan model.AccessLog
	done    chan struct{}
	mu      sync.RWMutex
	closed  bool
	dropped atomic.Uint64
}

func NewAccessLogWriter(db *gorm.DB, capacity int) *AccessLogWriter {
	return newAccessLogWriter(capacity, func(ctx context.Context, items []model.AccessLog) error {
		for i := range items {
			items[i].Browser, items[i].OS, items[i].DeviceType = utils.ParseUserAgent(items[i].UserAgent)
			items[i].Country, items[i].City = utils.LookupIP(items[i].IPAddress)
		}
		return db.WithContext(ctx).CreateInBatches(&items, 100).Error
	})
}

func newAccessLogWriter(capacity int, write func(context.Context, []model.AccessLog) error) *AccessLogWriter {
	if capacity < 1 {
		capacity = 1
	}
	w := &AccessLogWriter{queue: make(chan model.AccessLog, capacity), done: make(chan struct{})}
	go func() {
		defer close(w.done)
		ticker := time.NewTicker(250 * time.Millisecond)
		defer ticker.Stop()
		batch := make([]model.AccessLog, 0, 100)
		flush := func() {
			if len(batch) == 0 {
				return
			}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			err := write(ctx, batch)
			cancel()
			if err != nil {
				w.dropped.Add(uint64(len(batch)))
				utils.LogWarn("access log batch dropped", "count", len(batch), "error", err)
			}
			batch = batch[:0]
		}
		for {
			select {
			case item, ok := <-w.queue:
				if !ok {
					flush()
					return
				}
				batch = append(batch, item)
				if len(batch) == cap(batch) {
					flush()
				}
			case <-ticker.C:
				flush()
			}
		}
	}()
	return w
}

func (w *AccessLogWriter) Enqueue(item model.AccessLog) bool {
	// Bound bytes before retaining an entry; one oversized header must not cause
	// an entire batch to violate varchar limits or inflate the queue's memory.
	item.IPAddress = logField(item.IPAddress, 45)
	item.UserAgent = logField(item.UserAgent, 1000)
	item.Method = logField(item.Method, 10)
	item.Path = logField(item.Path, 1000)
	item.QueryParams = logField(item.QueryParams, 4096)
	item.Referer = logField(item.Referer, 1000)
	item.SessionID = logField(item.SessionID, 255)
	w.mu.RLock()
	defer w.mu.RUnlock()
	if w.closed {
		return false
	}
	select {
	case w.queue <- item:
		return true
	default:
		w.dropped.Add(1)
		return false
	}
}

func logField(value string, limit int) string {
	if len(value) > limit {
		value = value[:limit]
	}
	// Clone releases the potentially much larger request-header backing string.
	return strings.Clone(strings.ReplaceAll(strings.ToValidUTF8(value, ""), "\x00", ""))
}
func (w *AccessLogWriter) Dropped() uint64 { return w.dropped.Load() }
func (w *AccessLogWriter) Pending() int    { return len(w.queue) }
func (w *AccessLogWriter) Close(ctx context.Context) error {
	w.mu.Lock()
	if !w.closed {
		w.closed = true
		close(w.queue)
	}
	w.mu.Unlock()
	select {
	case <-w.done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Retention is opt-in; deletion proceeds in small transactions to bound locks.
func PruneAccessLogs(ctx context.Context, db *gorm.DB, before time.Time) error {
	for {
		result := db.WithContext(ctx).Exec("DELETE FROM access_logs WHERE id IN (SELECT id FROM access_logs WHERE created_at < ? ORDER BY created_at LIMIT 5000)", before)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected < 5000 {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(50 * time.Millisecond):
		}
	}
}
