package middleware

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"tano_blog/backend/internal/monitoring"
)

func TestRequestMetricsUsesTemplatesAndAggregatesUnmatchedURLs(t *testing.T) {
	r := gin.New()
	metrics := monitoring.NewRecorder()
	r.Use(RequestMetrics(metrics))
	r.GET("/posts/:slug", func(c *gin.Context) { c.Status(http.StatusOK) })
	for i := range 100 {
		r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", fmt.Sprintf("/posts/private-slug-%d?password=secret", i), nil))
		r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", fmt.Sprintf("/missing/private-slug-%d?password=secret", i), nil))
	}
	s := metrics.Snapshot(time.Now())
	if s.Requests != 200 || s.ClientErrors != 100 || len(s.Routes) != 2 {
		t.Fatalf("IDs must not create metric series: %+v", s)
	}
	raw, _ := json.Marshal(s)
	if strings.Contains(string(raw), "private-slug") || strings.Contains(string(raw), "secret") {
		t.Fatalf("metrics exposed request data: %s", raw)
	}
}

func TestRequestMetricsIncludesRecoveredPanics(t *testing.T) {
	r := gin.New()
	metrics := monitoring.NewRecorder()
	r.Use(RequestMetrics(metrics), gin.CustomRecovery(func(c *gin.Context, _ any) { c.AbortWithStatus(500) }))
	r.GET("/panic", func(c *gin.Context) { panic("test panic") })
	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/panic", nil))
	s := metrics.Snapshot(time.Now())
	if s.Requests != 1 || s.ServerErrors != 1 {
		t.Fatalf("recovered panics must count as server errors: %+v", s)
	}
}
