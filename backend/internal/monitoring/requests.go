// Package monitoring provides bounded, process-local operational telemetry.
package monitoring

import (
	"math"
	"sort"
	"sync"
	"time"
)

const (
	windowBuckets  = 30
	bucketSeconds  = int64(10)
	maxRouteSeries = 256
)

var latencyBoundsMS = [...]float64{5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000, 300000, 1800000}

type counters struct {
	Requests, ServerErrors, ClientErrors uint64
	Latency                              [len(latencyBoundsMS) + 1]uint64
}

type timeBucket struct {
	tick int64
	counters
}

type series [windowBuckets]timeBucket

type routeKey struct{ method, route string }

// Recorder retains at most 256 route series and 30 ten-second buckets per
// series. No request bodies, concrete URLs, IPs, queries or user IDs are stored.
type Recorder struct {
	mu     sync.Mutex
	all    series
	routes map[routeKey]*series
}

func NewRecorder() *Recorder {
	return &Recorder{routes: make(map[routeKey]*series)}
}

// Observe accepts a router's registered template, never a request URL. Unknown
// methods and unmatched routes collapse into fixed labels. The two reserved
// series keep unmatched traffic and overflow visible at the cardinality limit.
func (r *Recorder) Observe(method, route string, status int, duration time.Duration, now time.Time) {
	key := routeKey{method: method, route: route}
	switch method {
	case "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE":
	default:
		key.method = "OTHER"
	}
	if route == "" {
		key = routeKey{"*", "__unmatched__"}
	} else if len(route) > 256 {
		key = routeKey{"*", "__overflow__"}
	}
	ms := float64(duration) / float64(time.Millisecond)
	bucket := sort.SearchFloat64s(latencyBoundsMS[:], ms)
	tick := now.Unix() / bucketSeconds
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.routes[key]; !exists && key.route != "__unmatched__" && key.route != "__overflow__" && len(r.routes) >= maxRouteSeries-2 {
		key = routeKey{"*", "__overflow__"}
	}
	if r.routes[key] == nil {
		r.routes[key] = &series{}
	}
	addObservation(&r.all, tick, status, bucket)
	addObservation(r.routes[key], tick, status, bucket)
}

func addObservation(s *series, tick int64, status, latencyBucket int) {
	b := &s[tick%windowBuckets]
	if b.tick != tick {
		*b = timeBucket{tick: tick}
	}
	b.Requests++
	if status >= 500 {
		b.ServerErrors++
	} else if status >= 400 {
		b.ClientErrors++
	}
	b.Latency[latencyBucket]++
}

type LatencyBucket struct {
	UpperBoundMS *float64 `json:"upper_bound_ms"` // null is +infinity
	Count        uint64   `json:"count"`          // cumulative
}

type RequestStats struct {
	Requests       uint64          `json:"requests"`
	ServerErrors   uint64          `json:"server_errors"`
	ClientErrors   uint64          `json:"client_errors"`
	ErrorRate      *float64        `json:"error_rate"` // 5xx / all completed requests; nil when idle
	P95MS          *float64        `json:"p95_ms"`     // histogram bucket upper bound; nil when idle
	P95Overflow    bool            `json:"p95_overflow"`
	LatencyBuckets []LatencyBucket `json:"latency_buckets"`
}

type RouteStats struct {
	Method string `json:"method"`
	Route  string `json:"route"`
	RequestStats
}

type RequestSnapshot struct {
	WindowSeconds int64     `json:"window_seconds"`
	BucketSeconds int64     `json:"bucket_seconds"`
	WindowStart   time.Time `json:"window_start"`
	WindowEnd     time.Time `json:"window_end"`
	RequestStats
	Routes []RouteStats `json:"routes"`
}

func (r *Recorder) Snapshot(now time.Time) RequestSnapshot {
	tick := now.Unix() / bucketSeconds
	r.mu.Lock()
	defer r.mu.Unlock()
	snapshot := RequestSnapshot{
		WindowSeconds: windowBuckets * bucketSeconds,
		BucketSeconds: bucketSeconds,
		WindowStart:   time.Unix((tick-windowBuckets+1)*bucketSeconds, 0).UTC(),
		WindowEnd:     now.UTC(),
		RequestStats:  summarize(&r.all, tick),
		Routes:        make([]RouteStats, 0),
	}
	for key, value := range r.routes {
		stats := summarize(value, tick)
		if stats.Requests > 0 {
			snapshot.Routes = append(snapshot.Routes, RouteStats{Method: key.method, Route: key.route, RequestStats: stats})
		}
	}
	sort.Slice(snapshot.Routes, func(i, j int) bool {
		left, right := snapshot.Routes[i], snapshot.Routes[j]
		if left.Route == right.Route {
			return left.Method < right.Method
		}
		return left.Route < right.Route
	})
	return snapshot
}

func summarize(s *series, tick int64) RequestStats {
	var total counters
	for _, b := range s {
		if b.tick > tick || b.tick <= tick-windowBuckets {
			continue
		}
		total.Requests += b.Requests
		total.ServerErrors += b.ServerErrors
		total.ClientErrors += b.ClientErrors
		for i, count := range b.Latency {
			total.Latency[i] += count
		}
	}
	stats := RequestStats{Requests: total.Requests, ServerErrors: total.ServerErrors, ClientErrors: total.ClientErrors, LatencyBuckets: make([]LatencyBucket, len(total.Latency))}
	var cumulative uint64
	p95Rank := uint64(math.Ceil(float64(total.Requests) * 0.95))
	for i, count := range total.Latency {
		cumulative += count
		stats.LatencyBuckets[i].Count = cumulative
		if i < len(latencyBoundsMS) {
			bound := latencyBoundsMS[i]
			stats.LatencyBuckets[i].UpperBoundMS = &bound
		}
		if total.Requests > 0 && stats.P95MS == nil && cumulative >= p95Rank {
			bound := latencyBoundsMS[min(i, len(latencyBoundsMS)-1)]
			stats.P95MS = &bound
			stats.P95Overflow = i == len(latencyBoundsMS)
		}
	}
	if total.Requests > 0 {
		rate := float64(total.ServerErrors) / float64(total.Requests)
		stats.ErrorRate = &rate
	}
	return stats
}
