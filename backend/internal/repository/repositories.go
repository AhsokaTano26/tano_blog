package repository

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
)

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
		query = query.Where("path LIKE ?", "%"+path+"%")
	}
	if method, ok := filters["method"]; ok && method != "" {
		query = query.Where("method = ?", method)
	}
	if ip, ok := filters["ip"]; ok && ip != "" {
		query = query.Where("ip_address LIKE ?", "%"+ip+"%")
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
	var dailyCounts []DailyCount
	r.db.Model(&model.AccessLog{}).
		Select("DATE(created_at) as date, COUNT(*) as count").
		Where("created_at >= NOW() - INTERVAL '7 days'").
		Group("DATE(created_at)").
		Order("date").
		Scan(&dailyCounts)

	return map[string]interface{}{
		"total_requests":   totalRequests,
		"unique_ips":       uniqueIPs,
		"total_errors":     totalErrors,
		"avg_response_ms":  avgResponseTime,
		"daily_counts":     dailyCounts,
	}, nil
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
		Preload("Category").Preload("Tags").Preload("Author")

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
		query = query.Where("title ILIKE ? OR content ILIKE ?", "%"+search+"%", "%"+search+"%")
	}

	query.Count(&total)
	err := query.Order("is_top DESC, published_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&posts).Error
	return posts, total, err
}

func (r *PostRepo) GetBySlug(slug string) (*model.Post, error) {
	var post model.Post
	err := r.db.Where("slug = ?", slug).Preload("Category").Preload("Tags").Preload("Author").First(&post).Error
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
	type ArchiveItem struct {
		Year  int
		Month int
		Count int
	}
	var items []ArchiveItem
	r.db.Model(&model.Post{}).
		Select("EXTRACT(YEAR FROM published_at)::int as year, EXTRACT(MONTH FROM published_at)::int as month, COUNT(*) as count").
		Where("status = ? AND published_at IS NOT NULL", "published").
		Group("year, month").
		Order("year DESC, month DESC").
		Scan(&items)

	var result []map[string]interface{}
	for _, item := range items {
		var posts []model.Post
		r.db.Where("status = ? AND EXTRACT(YEAR FROM published_at) = ? AND EXTRACT(MONTH FROM published_at) = ?",
			"published", item.Year, item.Month).
			Select("id, title, slug, published_at, excerpt").
			Order("published_at DESC").
			Find(&posts)
		result = append(result, map[string]interface{}{
			"year":  item.Year,
			"month": item.Month,
			"count": item.Count,
			"posts": posts,
		})
	}
	return result, nil
}

func (r *PostRepo) TopPosts() ([]model.Post, error) {
	var posts []model.Post
	err := r.db.Where("status = ? AND is_top = ?", "published", true).
		Preload("Category").Preload("Tags").
		Order("published_at DESC").Limit(5).Find(&posts).Error
	return posts, err
}

func (r *PostRepo) AdminList(page, pageSize int, status string) ([]model.Post, int64, error) {
	var posts []model.Post
	var total int64
	query := r.db.Model(&model.Post{}).Preload("Category").Preload("Tags").Preload("Author")

	if status != "" {
		query = query.Where("status = ?", status)
	}

	query.Count(&total)
	err := query.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&posts).Error
	return posts, total, err
}

func (r *PostRepo) Create(post *model.Post) error {
	return r.db.Create(post).Error
}

func (r *PostRepo) Update(id uuid.UUID, updates map[string]interface{}) error {
	return r.db.Model(&model.Post{}).Where("id = ?", id).Updates(updates).Error
}

func (r *PostRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&model.Post{}, id).Error
}

func (r *PostRepo) GetByID(id uuid.UUID) (*model.Post, error) {
	var post model.Post
	err := r.db.Preload("Category").Preload("Tags").Preload("Author").First(&post, id).Error
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

type CategoryRepo struct {
	db *gorm.DB
}

func NewCategoryRepo(db *gorm.DB) *CategoryRepo {
	return &CategoryRepo{db: db}
}

func (r *CategoryRepo) List() ([]model.Category, error) {
	var cats []model.Category
	err := r.db.Order("sort_order ASC, name ASC").Find(&cats).Error
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
	err := r.db.Order("name ASC").Find(&tags).Error
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

func (r *CommentRepo) ListByPost(postID uuid.UUID) ([]model.Comment, error) {
	var comments []model.Comment
	err := r.db.Where("post_id = ? AND status = ? AND parent_id IS NULL", postID, "approved").
		Preload("Children", "status = ?", "approved").
		Order("created_at ASC").Find(&comments).Error
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

type MediaRepo struct {
	db *gorm.DB
}

func NewMediaRepo(db *gorm.DB) *MediaRepo {
	return &MediaRepo{db: db}
}

func (r *MediaRepo) List(page, pageSize int) ([]model.Media, int64, error) {
	var media []model.Media
	var total int64
	r.db.Model(&model.Media{}).Count(&total)
	err := r.db.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&media).Error
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
	err := r.db.First(&m, id).Error
	return &m, err
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

func (r *SiteConfigRepo) Upsert(key, value, valueType string) error {
	var config model.SiteConfig
	result := r.db.Where("key = ?", key).First(&config)
	if result.Error != nil {
		return r.db.Create(&model.SiteConfig{Key: key, Value: value, Type: valueType}).Error
	}
	return r.db.Model(&config).Update("value", value).Error
}
