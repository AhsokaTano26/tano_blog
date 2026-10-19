package monitoring

import (
	"fmt"
	"testing"
	"time"
)

func TestRequestWindowExpiresOldErrorsAndHasNoIdlePercentiles(t *testing.T) {
	r := NewRecorder()
	now := time.Unix(1800000000, 0)
	r.Observe("GET", "/posts/:slug", 503, 900*time.Millisecond, now)
	r.Observe("GET", "/posts/:slug", 200, 20*time.Millisecond, now)
	r.Observe("GET", "/posts/:slug", 404, 20*time.Millisecond, now)
	s := r.Snapshot(now)
	if s.Requests != 3 || s.ServerErrors != 1 || s.ClientErrors != 1 || s.ErrorRate == nil || *s.ErrorRate < 0.333 || *s.ErrorRate > 0.334 {
		t.Fatalf("5xx rate must use all completed requests: %+v", s)
	}
	if s.P95MS == nil || *s.P95MS != 1000 || len(s.Routes) != 1 || s.Routes[0].Requests != 3 {
		t.Fatalf("histogram must include the slow request: %+v", s)
	}
	idle := r.Snapshot(now.Add(5 * time.Minute))
	if idle.Requests != 0 || idle.ErrorRate != nil || idle.P95MS != nil || len(idle.Routes) != 0 {
		t.Fatalf("expired traffic must not report a healthy zero percentile: %+v", idle)
	}
	r.Observe("GET", "/posts/:slug", 200, 3*time.Millisecond, now.Add(6*time.Minute))
	fresh := r.Snapshot(now.Add(6 * time.Minute))
	if fresh.Requests != 1 || fresh.ServerErrors != 0 || fresh.P95MS == nil || *fresh.P95MS != 5 {
		t.Fatalf("ring slot must not retain the previous generation: %+v", fresh)
	}
}

func TestRequestSeriesOverflowPreservesGlobalTotals(t *testing.T) {
	r := NewRecorder()
	now := time.Now()
	for i := range 2000 {
		r.Observe("GET", fmt.Sprintf("/registered/%d/:id", i), 200, time.Millisecond, now)
	}
	s := r.Snapshot(now)
	if s.Requests != 2000 || len(s.Routes) > 256 {
		t.Fatalf("route series must be bounded without dropping global counts: %d requests / %d routes", s.Requests, len(s.Routes))
	}
	var total uint64
	var overflow bool
	for _, route := range s.Routes {
		total += route.Requests
		overflow = overflow || route.Route == "__overflow__"
	}
	if total != 2000 || !overflow {
		t.Fatalf("overflow requests must remain visible: total %d overflow %t", total, overflow)
	}
}

func TestHistogramOverflowRemainsVisible(t *testing.T) {
	r := NewRecorder()
	now := time.Now()
	r.Observe("POST", "/admin/backups", 201, 2*time.Hour, now)
	s := r.Snapshot(now)
	if !s.P95Overflow || s.P95MS == nil || *s.P95MS <= 0 {
		t.Fatalf("a long-running backup must not look idle: %+v", s)
	}
	last := s.LatencyBuckets[len(s.LatencyBuckets)-1]
	if last.UpperBoundMS != nil || last.Count != 1 {
		t.Fatalf("unbounded histogram bucket missing: %+v", last)
	}
}
