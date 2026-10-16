package repository

import (
	"encoding/base64"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
)

func TestAccessLogCursorKeepsTiesStableAcrossNewAndDeletedRows(t *testing.T) {
	db := testutil.Database(t, &model.AccessLog{})
	when := time.Date(2026, 10, 16, 2, 0, 0, 0, time.UTC)
	id := func(n int) uuid.UUID { return uuid.MustParse(fmt.Sprintf("00000000-0000-0000-0000-%012d", n)) }
	for i := 1; i <= 6; i++ {
		row := model.AccessLog{ID: id(i), CreatedAt: when, Path: "/matched", Method: "GET", IPAddress: "127.0.0.1", UserAgent: fmt.Sprintf("full detail %d", i), StatusCode: 200}
		if err := db.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
	}
	excluded := model.AccessLog{ID: id(99), CreatedAt: when, Path: "/other", Method: "POST", IPAddress: "127.0.0.2", StatusCode: 500}
	if err := db.Create(&excluded).Error; err != nil {
		t.Fatal(err)
	}
	filters := map[string]string{"path": "/matched", "method": "GET", "status_code": "200", "start": when.Add(-time.Hour).Format(time.RFC3339), "end": when.Add(time.Hour).Format(time.RFC3339)}
	repo := NewAccessLogRepo(db)
	first, total, err := repo.List(1, 2, filters)
	if err != nil || total != 6 || len(first) != 2 || first[0].ID != id(6) || first[1].ID != id(5) {
		t.Fatalf("first page: %+v total=%d err=%v", first, total, err)
	}
	if first[0].UserAgent != "full detail 6" {
		t.Fatal("requested log details were omitted")
	}
	cursor := EncodeLogCursor(first, total, 2)
	// The cursor row itself need not remain in the database. Newly inserted head
	// records must not duplicate the rows returned by the first page.
	if err := db.Delete(&model.AccessLog{}, id(5)).Error; err != nil {
		t.Fatal(err)
	}
	newer := model.AccessLog{ID: id(7), CreatedAt: when, Path: "/matched", Method: "GET", IPAddress: "127.0.0.1", StatusCode: 200}
	if err := db.Create(&newer).Error; err != nil {
		t.Fatal(err)
	}
	for _, expected := range [][2]int{{4, 3}, {2, 1}} {
		filters["cursor"] = cursor
		rows, total, err := repo.List(999, 2, filters)
		if err != nil || total != 6 || len(rows) != 2 || rows[0].ID != id(expected[0]) || rows[1].ID != id(expected[1]) {
			t.Fatalf("cursor page want %v: %+v total=%d err=%v", expected, rows, total, err)
		}
		cursor = EncodeLogCursor(rows, total, 2)
	}
	filters["cursor"] = cursor
	rows, total, err := repo.List(999, 2, filters)
	if err != nil || total != 6 || len(rows) != 0 || EncodeLogCursor(rows, total, 2) != "" {
		t.Fatalf("end page: %+v total=%d err=%v", rows, total, err)
	}
}

func TestAccessLogPaginationEscapesLiteralFiltersAndHandlesEmptyPage(t *testing.T) {
	db := testutil.Database(t, &model.AccessLog{})
	when := time.Date(2026, 10, 16, 2, 0, 0, 0, time.UTC)
	for _, row := range []model.AccessLog{
		{Path: `/50%_test\file`, IPAddress: "10.0.0.1", Method: "GET", CreatedAt: when},
		{Path: `/50anythingXtest\file`, IPAddress: "10.0.0.2", Method: "GET", CreatedAt: when},
		{Path: `/50%_test\file`, IPAddress: "10.0.0.3", Method: "GET", CreatedAt: when.Add(time.Hour)},
	} {
		if err := db.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
	}
	filters := map[string]string{"path": `50%_test\file`, "start": when.Format(time.RFC3339), "end": when.Add(time.Hour).Format(time.RFC3339)}
	repo := NewAccessLogRepo(db)
	rows, total, err := repo.List(1, 20, filters)
	if err != nil || total != 1 || len(rows) != 1 || rows[0].IPAddress != "10.0.0.1" {
		t.Fatalf("literal filters or exclusive end changed: %+v %d %v", rows, total, err)
	}
	rows, total, err = repo.List(2, 20, filters)
	if err != nil || total != 1 || len(rows) != 0 {
		t.Fatalf("empty page lost total: %+v %d %v", rows, total, err)
	}
}

func TestAccessLogRejectsMalformedCursor(t *testing.T) {
	db := testutil.Database(t, &model.AccessLog{})
	for _, raw := range []string{"not-base64!", strings.Repeat("a", 513), base64.RawURLEncoding.EncodeToString([]byte(`{"id":"00000000-0000-0000-0000-000000000001","at":"2026-10-16T00:00:00Z","total":-1}`)), base64.RawURLEncoding.EncodeToString([]byte(`{}`))} {
		if _, _, err := NewAccessLogRepo(db).List(1, 20, map[string]string{"cursor": raw}); err == nil {
			t.Fatalf("invalid cursor accepted: %q", raw)
		}
	}
}
