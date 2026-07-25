package repository

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"errors"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
)

type NameCount struct {
	Name  string `json:"name"`
	Count int64  `json:"count"`
}

type DailyCount struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

type AccessLogRepo struct {
	db *gorm.DB
}

func NewAccessLogRepo(db *gorm.DB) *AccessLogRepo {
	return &AccessLogRepo{db: db}
}

func (r *AccessLogRepo) List(page, pageSize int, filters map[string]string) ([]model.AccessLog, int64, error) {
	var logs []model.AccessLog
	var total int64
	query := r.db.Model(&model.AccessLog{})

	if path, ok := filters["path"]; ok && path != "" {
		escaped := strings.ReplaceAll(strings.ReplaceAll(path, "%", "\\%"), "_", "\\_")
		query = query.Where("path LIKE ?", "%"+escaped+"%")
	}
	if method, ok := filters["method"]; ok && method != "" {
		query = query.Where("method = ?", method)
	}
	if ip, ok := filters["ip"]; ok && ip != "" {
		escaped := strings.ReplaceAll(strings.ReplaceAll(ip, "%", "\\%"), "_", "\\_")
		query = query.Where("ip_address LIKE ?", "%"+escaped+"%")
	}
	if status, ok := filters["status_code"]; ok && status != "" {
		query = query.Where("status_code = ?", status)
	}
	if start, ok := filters["start"]; ok && start != "" {
		query = query.Where("created_at >= ?", start)
	}
	if end, ok := filters["end"]; ok && end != "" {
		query = query.Where("created_at <= ?", end)
	}

	query.Count(&total)
	err := query.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&logs).Error
	return logs, total, err
}

func (r *AccessLogRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&model.AccessLog{}, id).Error
}

func (r *AccessLogRepo) Clear() error {
	return r.db.Where("1 = 1").Delete(&model.AccessLog{}).Error
}

func (r *AccessLogRepo) Stats() (map[string]interface{}, error) {
	var totalRequests int64
	var uniqueIPs int64
	var totalErrors int64
	var avgResponseTime float64

	r.db.Model(&model.AccessLog{}).Count(&totalRequests)
	r.db.Model(&model.AccessLog{}).Select("COUNT(DISTINCT ip_address)").Scan(&uniqueIPs)
	r.db.Model(&model.AccessLog{}).Where("status_code >= 400").Count(&totalErrors)
	r.db.Model(&model.AccessLog{}).Select("COALESCE(AVG(response_time), 0)").Scan(&avgResponseTime)

	// Daily counts for last 7 days
	type DailyCount struct {
		Date  string `json:"date"`
		Count int64  `json:"count"`
	}
	var dbCounts []DailyCount
	r.db.Model(&model.AccessLog{}).
		Select("to_char(DATE(created_at), 'YYYY-MM-DD') as date, COUNT(*) as count").
		Where("created_at >= NOW() - INTERVAL '6 days'").
		Group("DATE(created_at)").
		Order("date").
		Scan(&dbCounts)

	countMap := make(map[string]int64)
	for _, d := range dbCounts {
		countMap[d.Date] = d.Count
	}

	var dailyCounts []DailyCount
	for i := 6; i >= 0; i-- {
		date := time.Now().AddDate(0, 0, -i).Format("2006-01-02")
		dailyCounts = append(dailyCounts, DailyCount{Date: date, Count: countMap[date]})
	}

	return map[string]interface{}{
		"total_requests":  totalRequests,
		"unique_ips":      uniqueIPs,
		"total_errors":    totalErrors,
		"avg_response_ms": avgResponseTime,
		"daily_counts":    dailyCounts,
	}, nil
}

func (r *AccessLogRepo) StatsByDevice() ([]map[string]interface{}, error) {
	var results []map[string]interface{}
	err := r.db.Model(&model.AccessLog{}).
		Select("COALESCE(NULLIF(device_type, ''), 'unknown') as name, COUNT(*) as count").
		Group("device_type").
		Order("count DESC").
		Find(&results).Error
	return results, err
}

func (r *AccessLogRepo) StatsByBrowser() ([]map[string]interface{}, error) {
	var results []map[string]interface{}
	err := r.db.Model(&model.AccessLog{}).
		Select("COALESCE(NULLIF(browser, ''), 'unknown') as name, COUNT(*) as count").
		Group("browser").
		Order("count DESC").
		Find(&results).Error
	return results, err
}

func (r *AccessLogRepo) StatsByOS() ([]map[string]interface{}, error) {
	var results []map[string]interface{}
	err := r.db.Model(&model.AccessLog{}).
		Select("COALESCE(NULLIF(os, ''), 'unknown') as name, COUNT(*) as count").
		Group("os").
		Order("count DESC").
		Find(&results).Error
	return results, err
}

func (r *AccessLogRepo) StatsByHour() ([]map[string]interface{}, error) {
	var results []map[string]interface{}
	err := r.db.Model(&model.AccessLog{}).
		Select("EXTRACT(HOUR FROM created_at)::int as hour, COUNT(*) as count").
		Group("hour").
		Order("hour ASC").
		Find(&results).Error
	return results, err
}

func (r *AccessLogRepo) StatsByCountry() ([]NameCount, error) {
	var items []NameCount
	err := r.db.Model(&model.AccessLog{}).
		Select("COALESCE(NULLIF(country, ''), '未知') as name, COUNT(*) as count").
		Group("name").Order("count DESC").Limit(20).Find(&items).Error
	return items, err
}

func (r *AccessLogRepo) StatsByReferrer() ([]NameCount, error) {
	var items []NameCount
	err := r.db.Model(&model.AccessLog{}).
		Select("COALESCE(NULLIF(referer, ''), '直接访问') as name, COUNT(*) as count").
		Group("name").Order("count DESC").Limit(20).Find(&items).Error
	return items, err
}

func (r *AccessLogRepo) StatsByPath() ([]NameCount, error) {
	var items []NameCount
	err := r.db.Model(&model.AccessLog{}).
		Select("path as name, COUNT(*) as count").
		Group("path").Order("count DESC").Limit(20).Find(&items).Error
	return items, err
}

func (r *AccessLogRepo) StatsByStatusCode() ([]NameCount, error) {
	var items []NameCount
	err := r.db.Model(&model.AccessLog{}).
		Select("CAST(status_code AS TEXT) as name, COUNT(*) as count").
		Group("name").Order("count DESC").Find(&items).Error
	return items, err
}

type TimeRangeStats struct {
	TotalRequests int64        `json:"total_requests"`
	UniqueIPs     int64        `json:"unique_ips"`
	TotalErrors   int64        `json:"total_errors"`
	AvgResponseMs float64      `json:"avg_response_ms"`
	DailyCounts   []DailyCount `json:"daily_counts"`
}

func (r *AccessLogRepo) StatsTimeRange(start, end string) (*TimeRangeStats, error) {
	makeQuery := func() *gorm.DB {
		q := r.db.Model(&model.AccessLog{})
		if start != "" {
			q = q.Where("created_at >= ?", start+" 00:00:00")
		}
		if end != "" {
			q = q.Where("created_at <= ?", end+" 23:59:59")
		}
		return q
	}

	var stats TimeRangeStats
	makeQuery().Count(&stats.TotalRequests)
	makeQuery().Select("COUNT(DISTINCT ip_address)").Scan(&stats.UniqueIPs)
	makeQuery().Where("status_code >= 400").Count(&stats.TotalErrors)
	makeQuery().Select("COALESCE(AVG(response_time), 0)").Scan(&stats.AvgResponseMs)

	rows, err := makeQuery().Select("to_char(DATE(created_at), 'YYYY-MM-DD') as date, COUNT(*) as count").
		Group("DATE(created_at)").Order("date ASC").Rows()
	if err != nil {
		return &stats, nil
	}
	defer rows.Close()
	for rows.Next() {
		var dc DailyCount
		if err := rows.Scan(&dc.Date, &dc.Count); err != nil {
			continue
		}
		stats.DailyCounts = append(stats.DailyCounts, dc)
	}
	if err := rows.Err(); err != nil {
		return &stats, nil
	}
	return &stats, nil
}

type PostRepo struct {
	db *gorm.DB
}

func NewPostRepo(db *gorm.DB) *PostRepo {
	return &PostRepo{db: db}
}

func (r *PostRepo) ListPublic(page, pageSize int, category, tag, search string) ([]model.Post, int64, error) {
	var posts []model.Post
	var total int64
	query := r.db.Model(&model.Post{}).Where("status = ?", "published").
		Preload("Category").Preload("Tags").Preload("Author").Preload("Series")

	if category != "" {
		query = query.Joins("JOIN categories ON categories.id = posts.category_id").
			Where("categories.slug = ?", category)
	}
	if tag != "" {
		query = query.Joins("JOIN post_tags ON post_tags.post_id = posts.id").
			Joins("JOIN tags ON tags.id = post_tags.tag_id").
			Where("tags.slug = ?", tag)
	}
	if search != "" {
		escaped := strings.ReplaceAll(strings.ReplaceAll(search, "%", "\\%"), "_", "\\_")
		query = query.Where("title ILIKE ? OR content ILIKE ?", "%"+escaped+"%", "%"+escaped+"%")
	}

	query.Count(&total)
	// Keep every article list in creation-time order. Titles provide a stable,
	// human-readable order when multiple posts share the same timestamp.
	err := query.Order("created_at DESC, title ASC, id ASC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&posts).Error
	if err != nil {
		return posts, total, err
	}

	// Batch fetch comment counts
	if len(posts) > 0 {
		ids := make([]uuid.UUID, len(posts))
		for i, p := range posts {
			ids[i] = p.ID
		}
		type countResult struct {
			PostID uuid.UUID
			Count  int64
		}
		var counts []countResult
		r.db.Model(&model.Comment{}).
			Select("post_id, COUNT(*) as count").
			Where("post_id IN ? AND status = ?", ids, "approved").
			Group("post_id").Find(&counts)
		countMap := make(map[uuid.UUID]int64)
		for _, c := range counts {
			countMap[c.PostID] = c.Count
		}
		for i := range posts {
			posts[i].CommentCount = countMap[posts[i].ID]
		}
	}

	return posts, total, nil
}

func (r *PostRepo) GetBySlug(slug string) (*model.Post, error) {
	var post model.Post
	err := r.db.Where("slug = ?", slug).Preload("Category").Preload("Tags").Preload("Author").Preload("Series").First(&post).Error
	if err != nil {
		return nil, err
	}
	return &post, nil
}

func (r *PostRepo) IncrementView(id uuid.UUID) error {
	return r.db.Model(&model.Post{}).Where("id = ?", id).
		UpdateColumn("view_count", gorm.Expr("view_count + 1")).Error
}

func (r *PostRepo) Archive() ([]map[string]interface{}, error) {
	type ArchivePost struct {
		ID          uuid.UUID  `json:"id"`
		Title       string     `json:"title"`
		Slug        string     `json:"slug"`
		PublishedAt *time.Time `json:"published_at"`
		Excerpt     string     `json:"excerpt"`
		Year        int        `json:"-"`
		Month       int        `json:"-"`
	}

	var posts []ArchivePost
	err := r.db.Model(&model.Post{}).
		Select("id, title, slug, published_at, created_at, excerpt, EXTRACT(YEAR FROM created_at)::int as year, EXTRACT(MONTH FROM created_at)::int as month").
		Where("status = ? AND published_at IS NOT NULL", "published").
		Order("created_at DESC").
		Find(&posts).Error
	if err != nil {
		return nil, err
	}

	// Group by year/month
	groups := make(map[string]*map[string]interface{})
	var keys []string
	for _, p := range posts {
		key := fmt.Sprintf("%d-%02d", p.Year, p.Month)
		if _, exists := groups[key]; !exists {
			keys = append(keys, key)
			groups[key] = &map[string]interface{}{
				"year":  p.Year,
				"month": p.Month,
				"count": 0,
				"posts": []ArchivePost{},
			}
		}
		group := *groups[key]
		group["count"] = group["count"].(int) + 1
		group["posts"] = append(group["posts"].([]ArchivePost), p)
	}

	var result []map[string]interface{}
	for _, key := range keys {
		result = append(result, *groups[key])
	}
	return result, nil
}

func (r *PostRepo) TopPosts() ([]model.Post, error) {
	var posts []model.Post
	err := r.db.Where("status = ? AND is_top = ?", "published", true).
		Preload("Category").Preload("Tags").
		Order("created_at DESC").Limit(5).Find(&posts).Error
	return posts, err
}

func (r *PostRepo) TopViewed(limit int) ([]model.Post, error) {
	var posts []model.Post
	err := r.db.Where("status = ?", "published").
		Order("view_count DESC").Limit(limit).Find(&posts).Error
	return posts, err
}

func (r *PostRepo) AdjacentPosts(slug string) (prev, next *model.Post) {
	var current model.Post
	if err := r.db.Where("slug = ? AND status = ?", slug, "published").First(&current).Error; err != nil {
		return nil, nil
	}

	var prevPost model.Post
	if err := r.db.Where("created_at < ? AND status = ?", current.CreatedAt, "published").
		Order("created_at DESC").Limit(1).First(&prevPost).Error; err == nil {
		prev = &prevPost
	}

	var nextPost model.Post
	if err := r.db.Where("created_at > ? AND status = ?", current.CreatedAt, "published").
		Order("created_at ASC").Limit(1).First(&nextPost).Error; err == nil {
		next = &nextPost
	}

	return
}

func (r *PostRepo) RelatedPosts(slug string, limit int) ([]model.Post, error) {
	var current model.Post
	if err := r.db.Where("slug = ? AND status = ?", slug, "published").First(&current).Error; err != nil {
		return nil, err
	}

	// Get tag IDs of current post
	var tagIDs []uuid.UUID
	r.db.Table("post_tags").Where("post_id = ?", current.ID).Pluck("tag_id", &tagIDs)

	if len(tagIDs) == 0 {
		return nil, nil
	}

	// Find posts sharing tags, ordered by match count
	var posts []model.Post
	err := r.db.Where("posts.id != ? AND posts.status = ?", current.ID, "published").
		Joins("JOIN post_tags ON post_tags.post_id = posts.id").
		Where("post_tags.tag_id IN ?", tagIDs).
		Group("posts.id").
		Order("COUNT(post_tags.tag_id) DESC, posts.created_at DESC").
		Limit(limit).
		Preload("Category").Preload("Tags").
		Find(&posts).Error

	return posts, err
}

func (r *PostRepo) AdminList(page, pageSize int, status string) ([]model.Post, int64, error) {
	var posts []model.Post
	var total int64
	query := r.db.Model(&model.Post{}).Preload("Category").Preload("Tags").Preload("Author").Preload("Editor")

	if status != "" {
		query = query.Where("status = ?", status)
	}

	query.Count(&total)
	err := query.Order("created_at DESC, title ASC, id ASC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&posts).Error
	return posts, total, err
}

func (r *PostRepo) Create(post *model.Post) error {
	return r.db.Create(post).Error
}

func (r *PostRepo) Update(id uuid.UUID, updates map[string]interface{}) error {
	return r.db.Model(&model.Post{}).Where("id = ?", id).Updates(updates).Error
}

func (r *PostRepo) BatchUpdate(ids []uuid.UUID, updates map[string]interface{}) error {
	return r.db.Model(&model.Post{}).Where("id IN ?", ids).Updates(updates).Error
}

func (r *PostRepo) Delete(id uuid.UUID) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// Delete associated comments
		if err := tx.Where("post_id = ?", id).Delete(&model.Comment{}).Error; err != nil {
			return err
		}
		// Delete post-tag associations
		if err := tx.Table("post_tags").Where("post_id = ?", id).Delete(nil).Error; err != nil {
			return err
		}
		// Delete the post
		return tx.Delete(&model.Post{}, id).Error
	})
}

func (r *PostRepo) GetByID(id uuid.UUID) (*model.Post, error) {
	var post model.Post
	err := r.db.Preload("Category").Preload("Tags").Preload("Author").Preload("Editor").First(&post, id).Error
	return &post, err
}

func (r *PostRepo) SetTags(postID uuid.UUID, tagIDs []uuid.UUID) error {
	post, err := r.GetByID(postID)
	if err != nil {
		return err
	}
	var tags []model.Tag
	if len(tagIDs) > 0 {
		r.db.Where("id IN ?", tagIDs).Find(&tags)
	}
	return r.db.Model(post).Association("Tags").Replace(tags)
}

func (r *PostRepo) SetSeries(postID uuid.UUID, seriesID uuid.UUID) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("post_id = ?", postID).Delete(&model.PostSeries{}).Error; err != nil {
			return err
		}
		return tx.Create(&model.PostSeries{SeriesID: seriesID, PostID: postID}).Error
	})
}

func (r *PostRepo) ClearSeries(postID uuid.UUID) error {
	return r.db.Where("post_id = ?", postID).Delete(&model.PostSeries{}).Error
}

func (r *PostRepo) SaveRevision(revision *model.PostRevision) error {
	return r.db.Create(revision).Error
}

func (r *PostRepo) ListRevisions(postID uuid.UUID) ([]model.PostRevision, error) {
	var revisions []model.PostRevision
	err := r.db.Where("post_id = ?", postID).Preload("Editor").
		Order("created_at DESC").Limit(50).Find(&revisions).Error
	return revisions, err
}

func (r *PostRepo) GetRevision(id uuid.UUID) (*model.PostRevision, error) {
	var rev model.PostRevision
	err := r.db.First(&rev, id).Error
	return &rev, err
}

func (r *PostRepo) GetByPreviewToken(token string) (*model.Post, error) {
	var post model.Post
	err := r.db.Where("preview_token = ?", token).Preload("Category").Preload("Tags").Preload("Author").First(&post).Error
	if err != nil {
		return nil, err
	}
	return &post, nil
}

func (r *PostRepo) ExportAll() ([]model.Post, error) {
	var posts []model.Post
	err := r.db.Preload("Category").Preload("Tags").Preload("Author").Order("created_at DESC").Find(&posts).Error
	return posts, err
}

func (r *PostRepo) ToggleReaction(postID uuid.UUID, emoji, ipAddress string) (bool, error) {
	var existing model.PostReaction
	err := r.db.Where("post_id = ? AND emoji = ? AND ip_address = ?", postID, emoji, ipAddress).Take(&existing).Error
	if err == nil {
		r.db.Delete(&existing)
		return false, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return false, err
	}
	reaction := model.PostReaction{
		PostID:    postID,
		Emoji:     emoji,
		IPAddress: ipAddress,
	}
	if err := r.db.Create(&reaction).Error; err != nil {
		return false, err
	}
	return true, nil
}

func (r *PostRepo) GetReactions(postIDs []uuid.UUID) (map[string]map[string]int, error) {
	type ReactionCount struct {
		PostID uuid.UUID
		Emoji  string
		Count  int
	}
	var rows []ReactionCount
	if err := r.db.Model(&model.PostReaction{}).
		Select("post_id, emoji, COUNT(*) as count").
		Where("post_id IN ?", postIDs).
		Group("post_id, emoji").
		Find(&rows).Error; err != nil {
		return nil, err
	}

	result := make(map[string]map[string]int)
	for _, row := range rows {
		pid := row.PostID.String()
		if result[pid] == nil {
			result[pid] = make(map[string]int)
		}
		result[pid][row.Emoji] = row.Count
	}
	return result, nil
}

func (r *PostRepo) GetUserReactions(postIDs []uuid.UUID, ipAddress string) (map[string][]string, error) {
	type UserReaction struct {
		PostID uuid.UUID
		Emoji  string
	}
	var rows []UserReaction
	if err := r.db.Model(&model.PostReaction{}).
		Select("post_id, emoji").
		Where("post_id IN ? AND ip_address = ?", postIDs, ipAddress).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	result := make(map[string][]string)
	for _, row := range rows {
		pid := row.PostID.String()
		result[pid] = append(result[pid], row.Emoji)
	}
	return result, nil
}

func (r *PostRepo) CalendarPosts(year, month string) ([]model.Post, error) {
	y, _ := strconv.Atoi(year)
	m, _ := strconv.Atoi(month)
	loc := time.FixedZone("CST", 8*3600)
	start := time.Date(y, time.Month(m), 1, 0, 0, 0, 0, loc).UTC()
	end := time.Date(y, time.Month(m), 1, 0, 0, 0, 0, loc).AddDate(0, 1, 0).UTC()
	var posts []model.Post
	err := r.db.Where(
		"(published_at >= ? AND published_at < ?) OR (EXTRACT(YEAR FROM created_at) = ? AND EXTRACT(MONTH FROM created_at) = ? AND status = 'draft' AND published_at IS NULL)",
		start, end, year, month,
	).Select("id, title, slug, status, published_at, created_at").
		Order("created_at ASC").
		Find(&posts).Error
	return posts, err
}

func (r *PostRepo) CalendarPostsPublic(year, month string) ([]model.Post, error) {
	y, _ := strconv.Atoi(year)
	m, _ := strconv.Atoi(month)
	loc := time.FixedZone("CST", 8*3600)
	start := time.Date(y, time.Month(m), 1, 0, 0, 0, 0, loc).UTC()
	end := time.Date(y, time.Month(m), 1, 0, 0, 0, 0, loc).AddDate(0, 1, 0).UTC()
	var posts []model.Post
	err := r.db.Where(
		"published_at >= ? AND published_at < ? AND status = 'published'", start, end,
	).Select("id, title, slug, published_at, created_at").
		Order("created_at ASC").
		Find(&posts).Error
	return posts, err
}

type CategoryRepo struct {
	db *gorm.DB
}

func NewCategoryRepo(db *gorm.DB) *CategoryRepo {
	return &CategoryRepo{db: db}
}

func (r *CategoryRepo) List() ([]model.Category, error) {
	var cats []model.Category
	err := r.db.Order("sort_order ASC, created_at ASC").Find(&cats).Error
	return cats, err
}

func (r *CategoryRepo) GetBySlug(slug string) (*model.Category, error) {
	var cat model.Category
	err := r.db.Where("slug = ?", slug).First(&cat).Error
	return &cat, err
}

func (r *CategoryRepo) Create(cat *model.Category) error {
	return r.db.Create(cat).Error
}

func (r *CategoryRepo) Update(id uuid.UUID, updates map[string]interface{}) error {
	return r.db.Model(&model.Category{}).Where("id = ?", id).Updates(updates).Error
}

func (r *CategoryRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&model.Category{}, id).Error
}

type TagRepo struct {
	db *gorm.DB
}

func NewTagRepo(db *gorm.DB) *TagRepo {
	return &TagRepo{db: db}
}

func (r *TagRepo) List() ([]model.Tag, error) {
	var tags []model.Tag
	err := r.db.Order("created_at ASC").Find(&tags).Error
	return tags, err
}

func (r *TagRepo) GetBySlug(slug string) (*model.Tag, error) {
	var tag model.Tag
	err := r.db.Where("slug = ?", slug).First(&tag).Error
	return &tag, err
}

func (r *TagRepo) Create(tag *model.Tag) error {
	return r.db.Create(tag).Error
}

func (r *TagRepo) Update(id uuid.UUID, updates map[string]interface{}) error {
	return r.db.Model(&model.Tag{}).Where("id = ?", id).Updates(updates).Error
}

func (r *TagRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&model.Tag{}, id).Error
}

type CommentRepo struct {
	db *gorm.DB
}

func NewCommentRepo(db *gorm.DB) *CommentRepo {
	return &CommentRepo{db: db}
}

func (r *CommentRepo) ListByPost(postID uuid.UUID, sort string) ([]model.Comment, error) {
	var comments []model.Comment
	orderClause := "created_at ASC"
	switch sort {
	case "newest":
		orderClause = "created_at DESC"
	case "reactions":
		orderClause = "(SELECT COUNT(*) FROM comment_reactions WHERE comment_reactions.comment_id = comments.id) DESC, created_at ASC"
	}
	err := r.db.Where("post_id = ? AND status = ? AND parent_id IS NULL", postID, "approved").
		Preload("Children", "status = ?", "approved").
		Order(orderClause).Find(&comments).Error
	return comments, err
}

func (r *CommentRepo) AdminList(page, pageSize int, status string) ([]model.Comment, int64, error) {
	var comments []model.Comment
	var total int64
	query := r.db.Model(&model.Comment{}).Preload("Post")

	if status != "" {
		query = query.Where("status = ?", status)
	}

	query.Count(&total)
	err := query.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&comments).Error
	return comments, total, err
}

func (r *CommentRepo) Create(comment *model.Comment) error {
	return r.db.Create(comment).Error
}

func (r *CommentRepo) UpdateStatus(id uuid.UUID, status string) error {
	return r.db.Model(&model.Comment{}).Where("id = ?", id).Update("status", status).Error
}

func (r *CommentRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&model.Comment{}, id).Error
}

func (r *CommentRepo) ToggleReaction(commentID uuid.UUID, emoji, ipAddress string) (bool, error) {
	var existing model.CommentReaction
	result := r.db.Where("comment_id = ? AND emoji = ? AND ip_address = ?", commentID, emoji, ipAddress).First(&existing)
	if result.Error == nil {
		// Already exists — remove (toggle off)
		if err := r.db.Delete(&existing).Error; err != nil {
			return false, err
		}
		return false, nil
	}

	// Not exists — create (toggle on)
	reaction := &model.CommentReaction{
		ID:        uuid.New(),
		CommentID: commentID,
		Emoji:     emoji,
		IPAddress: ipAddress,
	}
	if err := r.db.Create(reaction).Error; err != nil {
		return false, err
	}
	return true, nil
}

func (r *CommentRepo) GetReactions(commentIDs []uuid.UUID) (map[string]map[string]int, error) {
	type ReactionCount struct {
		CommentID uuid.UUID
		Emoji     string
		Count     int
	}
	var rows []ReactionCount
	r.db.Model(&model.CommentReaction{}).
		Select("comment_id, emoji, COUNT(*) as count").
		Where("comment_id IN ?", commentIDs).
		Group("comment_id, emoji").
		Scan(&rows)

	result := make(map[string]map[string]int)
	for _, row := range rows {
		cid := row.CommentID.String()
		if result[cid] == nil {
			result[cid] = make(map[string]int)
		}
		result[cid][row.Emoji] = row.Count
	}
	return result, nil
}

func (r *CommentRepo) GetUserReactions(commentIDs []uuid.UUID, ipAddress string) (map[string][]string, error) {
	type UserReaction struct {
		CommentID uuid.UUID
		Emoji     string
	}
	var rows []UserReaction
	r.db.Model(&model.CommentReaction{}).
		Select("comment_id, emoji").
		Where("comment_id IN ? AND ip_address = ?", commentIDs, ipAddress).
		Find(&rows)

	result := make(map[string][]string)
	for _, row := range rows {
		cid := row.CommentID.String()
		result[cid] = append(result[cid], row.Emoji)
	}
	return result, nil
}

func (r *CommentRepo) SaveRevision(commentID uuid.UUID, content string) error {
	return r.db.Create(&model.CommentRevision{
		CommentID: commentID,
		Content:   content,
		EditedAt:  time.Now(),
	}).Error
}

func (r *CommentRepo) ListRevisions(commentID uuid.UUID) ([]model.CommentRevision, error) {
	var items []model.CommentRevision
	err := r.db.Where("comment_id = ?", commentID).Order("edited_at DESC").Find(&items).Error
	return items, err
}

func (r *CommentRepo) UpdateContent(commentID uuid.UUID, content string) error {
	return r.db.Model(&model.Comment{}).Where("id = ?", commentID).
		Updates(map[string]interface{}{
			"content":      content,
			"edited_count": gorm.Expr("edited_count + 1"),
			"edited_at":    time.Now(),
		}).Error
}

type MediaRepo struct {
	db *gorm.DB
}

func NewMediaRepo(db *gorm.DB) *MediaRepo {
	return &MediaRepo{db: db}
}

func (r *MediaRepo) List(page, pageSize int, tagID string, search string) ([]model.Media, int64, error) {
	var media []model.Media
	var total int64

	// Build filter conditions
	query := r.db.Model(&model.Media{})
	if tagID != "" {
		query = query.Joins("JOIN media_tag_links ON media_tag_links.media_id = media.id").
			Where("media_tag_links.media_tag_id = ?", tagID)
	}
	if search != "" {
		pattern := "%" + strings.NewReplacer("%", "\\%", "_", "\\_").Replace(search) + "%"
		query = query.Where("original_name ILIKE ? OR filename ILIKE ? OR title ILIKE ? OR artist ILIKE ?", pattern, pattern)
	}

	query.Count(&total)

	err := query.Preload("Tags").
		Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&media).Error
	return media, total, err
}

func (r *MediaRepo) Create(m *model.Media) error {
	return r.db.Create(m).Error
}

func (r *MediaRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&model.Media{}, id).Error
}

func (r *MediaRepo) GetByID(id uuid.UUID) (*model.Media, error) {
	var m model.Media
	err := r.db.Preload("Tags").First(&m, id).Error
	return &m, err
}

func (r *MediaRepo) GetByIDs(ids []uuid.UUID) ([]model.Media, error) {
	var items []model.Media
	err := r.db.Where("id IN ?", ids).Find(&items).Error
	return items, err
}

func (r *MediaRepo) GetByURL(url string) (*model.Media, error) {
	var m model.Media
	err := r.db.Where("url = ?", url).First(&m).Error
	return &m, err
}

func (r *MediaRepo) UpdateTags(mediaID uuid.UUID, tagIDs []uuid.UUID) error {
	var m model.Media
	m.ID = mediaID
	var tags []model.MediaTag
	if len(tagIDs) > 0 {
		if err := r.db.Find(&tags, tagIDs).Error; err != nil {
			return err
		}
	}
	return r.db.Model(&m).Association("Tags").Replace(tags)
}

func (r *MediaRepo) BatchDelete(ids []uuid.UUID) error {
	if len(ids) == 0 {
		return nil
	}
	return r.db.Where("id IN ?", ids).Delete(&model.Media{}).Error
}

func (r *MediaRepo) BatchUpdateTags(ids []uuid.UUID, tagIDs []uuid.UUID) error {
	if len(ids) == 0 {
		return nil
	}
	var items []model.Media
	if err := r.db.Where("id IN ?", ids).Find(&items).Error; err != nil {
		return err
	}
	for _, item := range items {
		if err := r.db.Model(&item).Association("Tags").Replace(tagIDs); err != nil {
			return err
		}
	}
	return nil
}

func (r *MediaRepo) ListTags() ([]model.MediaTag, error) {
	var tags []model.MediaTag
	err := r.db.Order("name").Find(&tags).Error
	return tags, err
}

func (r *MediaRepo) UpdateMetadata(id uuid.UUID, updates map[string]interface{}) error {
	return r.db.Model(&model.Media{}).Where("id = ?", id).Updates(updates).Error
}

func (r *MediaRepo) CreateTag(name string) (*model.MediaTag, error) {
	tag := &model.MediaTag{Name: name}
	err := r.db.Create(tag).Error
	return tag, err
}

func (r *MediaRepo) DeleteTag(id uuid.UUID) error {
	r.db.Table("media_tag_links").Where("media_tag_id = ?", id).Delete(nil)
	return r.db.Delete(&model.MediaTag{}, id).Error
}

func (r *MediaRepo) GetTagByID(id uuid.UUID) (*model.MediaTag, error) {
	var tag model.MediaTag
	err := r.db.First(&tag, id).Error
	return &tag, err
}

type SiteConfigRepo struct {
	db *gorm.DB
}

func NewSiteConfigRepo(db *gorm.DB) *SiteConfigRepo {
	return &SiteConfigRepo{db: db}
}

func (r *SiteConfigRepo) GetAll() ([]model.SiteConfig, error) {
	var configs []model.SiteConfig
	err := r.db.Find(&configs).Error
	return configs, err
}

func (r *SiteConfigRepo) GetByKeys(keys []string) ([]model.SiteConfig, error) {
	var configs []model.SiteConfig
	err := r.db.Where("key IN ?", keys).Find(&configs).Error
	return configs, err
}

func (r *SiteConfigRepo) Get(key string) (string, error) {
	var config model.SiteConfig
	result := r.db.Where("key = ?", key).Limit(1).Find(&config)
	if result.Error != nil {
		return "", result.Error
	}
	if result.RowsAffected == 0 {
		// 保持调用方依赖的“未找到”语义，但避免 GORM 对可选配置输出误导性日志。
		return "", gorm.ErrRecordNotFound
	}
	return config.Value, nil
}

func (r *SiteConfigRepo) Upsert(key, value, valueType string) error {
	var config model.SiteConfig
	result := r.db.Where("key = ?", key).First(&config)
	if result.Error != nil {
		return r.db.Create(&model.SiteConfig{Key: key, Value: value, Type: valueType}).Error
	}
	return r.db.Model(&config).Update("value", value).Error
}

func (r *SiteConfigRepo) Delete(key string) error {
	return r.db.Where("key = ?", key).Delete(&model.SiteConfig{}).Error
}

type IPBanRepo struct {
	db *gorm.DB
}

func NewIPBanRepo(db *gorm.DB) *IPBanRepo {
	return &IPBanRepo{db: db}
}

func (r *IPBanRepo) Create(ban *model.IPBan) error {
	return r.db.Create(ban).Error
}

func (r *IPBanRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&model.IPBan{}, id).Error
}

func (r *IPBanRepo) List(page, pageSize int) ([]model.IPBan, int64, error) {
	var items []model.IPBan
	var total int64
	r.db.Model(&model.IPBan{}).Count(&total)
	err := r.db.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items).Error
	return items, total, err
}

func (r *IPBanRepo) FindActiveByIP(ip string) ([]model.IPBan, error) {
	var items []model.IPBan
	err := r.db.Where("ip_address = ?", ip).
		Where("(expires_at IS NULL OR expires_at > NOW())").
		Find(&items).Error
	return items, err
}
