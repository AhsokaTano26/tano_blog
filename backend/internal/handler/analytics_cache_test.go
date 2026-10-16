package handler

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"tano_blog/backend/internal/repository"
)

func TestAnalyticsCacheWaitHonorsRequestCancellation(t *testing.T) {
	h := NewAccessLogHandler(nil)
	start, end, err := repository.AnalyticsRange("2026-10-01", "2026-10-16", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	// A valid cache entry makes cleanup safe even when a broken implementation
	// waits for the lock before noticing cancellation.
	h.cache.entries[start.String()+end.String()] = analyticsEntry{expires: time.Now().Add(time.Hour), data: &repository.Analytics{}}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("GET", "/?start=2026-10-01&end=2026-10-16", nil).WithContext(ctx)
	h.cache.Lock()
	done := make(chan error, 1)
	go func() {
		_, err := h.analytics(c)
		done <- err
	}()
	cancel()
	select {
	case err := <-done:
		h.cache.Unlock()
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("canceled cache waiter returned %v", err)
		}
	case <-time.After(250 * time.Millisecond):
		h.cache.Unlock()
		<-done
		t.Fatal("canceled request remained blocked behind another analytics request")
	}
}
