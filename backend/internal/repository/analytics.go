package repository

import (
	"fmt"
	"gorm.io/gorm"
	"sort"
	"time"
)

type Analytics struct {
	Stats    *TimeRangeStats `json:"stats"`
	Path     []NameCount     `json:"path"`
	Referrer []NameCount     `json:"referrer"`
	Country  []NameCount     `json:"country"`
	Status   []NameCount     `json:"status"`
	Device   []NameCount     `json:"device"`
	Browser  []NameCount     `json:"browser"`
	OS       []NameCount     `json:"os"`
	Hour     []HourCount     `json:"hour"`
}
type HourCount struct {
	Hour  int   `json:"hour"`
	Count int64 `json:"count"`
}

// Date filters are inclusive calendar days in the site's existing UTC+8 zone.
func AnalyticsRange(start, end string, now time.Time) (time.Time, time.Time, error) {
	loc := time.FixedZone("Asia/Shanghai", 8*3600)
	if end == "" {
		end = now.In(loc).Format("2006-01-02")
	}
	e, err := time.ParseInLocation("2006-01-02", end, loc)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	if start == "" {
		start = e.AddDate(0, 0, -29).Format("2006-01-02")
	}
	s, err := time.ParseInLocation("2006-01-02", start, loc)
	if err != nil {
		return s, e, err
	}
	if e.Before(s) || e.Sub(s) > 365*24*time.Hour {
		return s, e, fmt.Errorf("统计范围应为1至366天")
	}
	return s, e.AddDate(0, 0, 1), nil
}

func (r *AccessLogRepo) InRange(start, end time.Time) *AccessLogRepo {
	return &AccessLogRepo{db: r.db.Session(&gorm.Session{}).Where("created_at >= ? AND created_at < ?", start, end)}
}

func (r *AccessLogRepo) Overview(start, end time.Time) (*Analytics, error) {
	result := &Analytics{Stats: &TimeRangeStats{DailyCounts: []DailyCount{}}, Path: []NameCount{}, Referrer: []NameCount{}, Country: []NameCount{}, Status: []NameCount{}, Device: []NameCount{}, Browser: []NameCount{}, OS: []NameCount{}, Hour: []HourCount{}}
	if err := r.db.Raw(`SELECT COUNT(*) AS total_requests, COUNT(DISTINCT ip_address) AS unique_ips,
  COUNT(*) FILTER(WHERE status_code>=400) AS total_errors, COALESCE(AVG(response_time),0) AS avg_response_ms
  FROM access_logs WHERE created_at>=? AND created_at<?`, start, end).Scan(result.Stats).Error; err != nil {
		return nil, err
	}
	var rows []struct {
		Kind  string
		Name  string
		Count int64
	}
	// One filtered scan supplies all distributions, instead of eight full-table scans.
	err := r.db.Raw(`WITH grouped AS (
 SELECT CASE WHEN GROUPING(path)=0 THEN 'path' WHEN GROUPING(referer)=0 THEN 'referrer'
  WHEN GROUPING(country)=0 THEN 'country' WHEN GROUPING(status_code)=0 THEN 'status'
  WHEN GROUPING(device_type)=0 THEN 'device' WHEN GROUPING(browser)=0 THEN 'browser'
  WHEN GROUPING(os)=0 THEN 'os' WHEN GROUPING(EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Shanghai'))=0 THEN 'hour' ELSE 'day' END AS kind,
 CASE WHEN GROUPING(path)=0 THEN path WHEN GROUPING(referer)=0 THEN COALESCE(NULLIF(referer,''),'直接访问')
  WHEN GROUPING(country)=0 THEN COALESCE(NULLIF(country,''),'未知') WHEN GROUPING(status_code)=0 THEN status_code::text
  WHEN GROUPING(device_type)=0 THEN COALESCE(NULLIF(device_type,''),'unknown') WHEN GROUPING(browser)=0 THEN COALESCE(NULLIF(browser,''),'unknown')
  WHEN GROUPING(os)=0 THEN COALESCE(NULLIF(os,''),'unknown') WHEN GROUPING(EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Shanghai'))=0 THEN EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Shanghai')::text
  ELSE to_char(DATE(created_at AT TIME ZONE 'Asia/Shanghai'),'YYYY-MM-DD') END AS name, COUNT(*) AS count
 FROM access_logs WHERE created_at>=? AND created_at<? GROUP BY GROUPING SETS
 ((path),(referer),(country),(status_code),(device_type),(browser),(os),(EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Shanghai')),(DATE(created_at AT TIME ZONE 'Asia/Shanghai')))
 ), ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY kind ORDER BY count DESC,name ASC) AS rank FROM grouped)
 SELECT kind,name,count FROM ranked WHERE rank<=20 OR kind IN ('day','hour','status') ORDER BY kind,count DESC,name ASC`, start, end).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	daily := map[string]int64{}
	for _, row := range rows {
		item := NameCount{Name: row.Name, Count: row.Count}
		switch row.Kind {
		case "path":
			result.Path = append(result.Path, item)
		case "referrer":
			result.Referrer = append(result.Referrer, item)
		case "country":
			result.Country = append(result.Country, item)
		case "status":
			result.Status = append(result.Status, item)
		case "device":
			result.Device = append(result.Device, item)
		case "browser":
			result.Browser = append(result.Browser, item)
		case "os":
			result.OS = append(result.OS, item)
		case "hour":
			var hour int
			fmt.Sscan(row.Name, &hour)
			result.Hour = append(result.Hour, HourCount{hour, row.Count})
		case "day":
			daily[row.Name] += row.Count
		}
	}
	for day := start; day.Before(end); day = day.AddDate(0, 0, 1) {
		d := day.Format("2006-01-02")
		result.Stats.DailyCounts = append(result.Stats.DailyCounts, DailyCount{d, daily[d]})
	}
	sort.Slice(result.Hour, func(i, j int) bool { return result.Hour[i].Hour < result.Hour[j].Hour })
	return result, nil
}
