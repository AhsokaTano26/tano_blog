package repository

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
)

type SeriesRepo struct {
	db *gorm.DB
}

func NewSeriesRepo(db *gorm.DB) *SeriesRepo {
	return &SeriesRepo{db: db}
}

func (r *SeriesRepo) List() ([]model.Series, error) {
	var series []model.Series
	err := r.db.Order("sort_order ASC, created_at DESC").Find(&series).Error
	return series, err
}

func (r *SeriesRepo) ListWithCount() ([]map[string]interface{}, error) {
	var results []map[string]interface{}
	err := r.db.Model(&model.Series{}).
		Select("series.*, COUNT(post_series.post_id) as post_count").
		Joins("LEFT JOIN post_series ON post_series.series_id = series.id").
		Group("series.id").
		Order("series.sort_order ASC, series.created_at DESC").
		Find(&results).Error
	return results, err
}

func (r *SeriesRepo) GetByID(id uuid.UUID) (*model.Series, error) {
	var s model.Series
	err := r.db.First(&s, id).Error
	return &s, err
}

func (r *SeriesRepo) GetBySlug(slug string) (*model.Series, error) {
	var s model.Series
	err := r.db.Where("slug = ?", slug).Preload("Posts", "status = ?", "published").
		Preload("Posts.Category").Preload("Posts.Tags").
		First(&s).Error
	if err != nil {
		return nil, err
	}
	// Order posts by PostSeries.SortOrder
	var postSeries []model.PostSeries
	r.db.Where("series_id = ?", s.ID).Order("sort_order ASC").Find(&postSeries)
	postMap := make(map[string]model.Post, len(s.Posts))
	for _, p := range s.Posts {
		postMap[p.ID.String()] = p
	}
	ordered := make([]model.Post, 0, len(s.Posts))
	for _, ps := range postSeries {
		if p, ok := postMap[ps.PostID.String()]; ok {
			ordered = append(ordered, p)
		}
	}
	// Append any posts not in the join table ordering (safety net)
	seen := make(map[string]bool)
	for _, p := range ordered {
		seen[p.ID.String()] = true
	}
	for _, p := range s.Posts {
		if !seen[p.ID.String()] {
			ordered = append(ordered, p)
		}
	}
	s.Posts = ordered
	return &s, nil
}

func (r *SeriesRepo) Create(s *model.Series) error {
	return r.db.Create(s).Error
}

func (r *SeriesRepo) Update(id uuid.UUID, updates map[string]interface{}) error {
	return r.db.Model(&model.Series{}).Where("id = ?", id).Updates(updates).Error
}

func (r *SeriesRepo) Delete(id uuid.UUID) error {
	r.db.Where("series_id = ?", id).Delete(&model.PostSeries{})
	return r.db.Delete(&model.Series{}, id).Error
}

func (r *SeriesRepo) ListPosts(seriesID uuid.UUID) ([]model.Post, error) {
	var posts []model.Post
	err := r.db.Joins("JOIN post_series ON post_series.post_id = posts.id").
		Where("post_series.series_id = ?", seriesID).
		Preload("Category").Preload("Tags").
		Order("post_series.sort_order ASC, posts.published_at DESC").
		Find(&posts).Error
	return posts, err
}

func (r *SeriesRepo) SetPosts(seriesID uuid.UUID, postIDs []uuid.UUID) error {
	tx := r.db.Begin()
	tx.Where("series_id = ?", seriesID).Delete(&model.PostSeries{})
	for i, pid := range postIDs {
		tx.Create(&model.PostSeries{SeriesID: seriesID, PostID: pid, SortOrder: i})
	}
	return tx.Commit().Error
}
