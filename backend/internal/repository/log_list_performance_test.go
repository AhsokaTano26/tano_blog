package repository

import (
	"context"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
)

type logListQueryRecorder struct {
	logger.Interface
	queries []string
}

func (l *logListQueryRecorder) Trace(_ context.Context, _ time.Time, fc func() (string, int64), _ error) {
	sql, _ := fc()
	if strings.HasPrefix(sql, "SELECT") && strings.Contains(sql, `"access_logs"`) {
		l.queries = append(l.queries, sql)
	}
}

func TestEmptyAccessLogPagesOnlyScanMatchesOnce(t *testing.T) {
	db := testutil.Database(t, &model.AccessLog{})
	for range 3 {
		if err := db.Create(&model.AccessLog{Path: "/matched", Method: "GET"}).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, tc := range []struct {
		name  string
		path  string
		page  int
		total int64
	}{
		{name: "missing filter", path: "does-not-exist", page: 1, total: 0},
		{name: "past last page", path: "matched", page: 20000, total: 3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := &logListQueryRecorder{Interface: logger.Default.LogMode(logger.Silent)}
			repo := NewAccessLogRepo(db.Session(&gorm.Session{Logger: recorder}))
			rows, total, err := repo.List(tc.page, 20, map[string]string{"path": tc.path})
			if err != nil || len(rows) != 0 || total != tc.total {
				t.Fatalf("empty page: rows=%d total=%d err=%v", len(rows), total, err)
			}
			if len(recorder.queries) != 1 {
				t.Fatalf("empty page scanned matching logs %d times; want one count: %v", len(recorder.queries), recorder.queries)
			}
		})
	}
}
