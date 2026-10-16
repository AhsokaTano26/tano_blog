package repository

import (
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
	"testing"
	"time"
)

func TestAnalyticsUsesOneConsistentInclusiveDateRange(t *testing.T) {
	db := testutil.Database(t, &model.AccessLog{})
	start, end, err := AnalyticsRange("2026-10-15", "2026-10-15", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	for i, at := range []time.Time{start.Add(-time.Microsecond), start, start.Add(time.Hour), end.Add(-time.Microsecond), end} {
		row := model.AccessLog{CreatedAt: at, IPAddress: "same-ip", Path: "/test", ResponseTime: 10, StatusCode: 200, DeviceType: "desktop"}
		if i == 2 {
			row.StatusCode = 500
		}
		if err := db.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
	}
	overview, err := NewAccessLogRepo(db).Overview(start, end)
	if err != nil {
		t.Fatal(err)
	}
	if overview.Stats.TotalRequests != 3 || overview.Stats.UniqueIPs != 1 || overview.Stats.TotalErrors != 1 {
		t.Fatalf("stats: %+v", overview.Stats)
	}
	if len(overview.Path) != 1 || overview.Path[0].Count != 3 || overview.Device[0].Count != 3 {
		t.Fatalf("distribution mismatch: %+v", overview)
	}
	if len(overview.Stats.DailyCounts) != 1 || overview.Stats.DailyCounts[0].Count != 3 {
		t.Fatalf("day boundaries: %+v", overview.Stats.DailyCounts)
	}
}
