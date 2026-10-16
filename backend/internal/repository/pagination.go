package repository

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
)

func (r *GalleryRepo) ListPage(page, size int) ([]model.GalleryImage, int64, error) {
	var total int64
	if err := r.db.Model(&model.GalleryImage{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := []model.GalleryImage{}
	err := r.db.Model(&model.GalleryImage{}).
		Select("gallery_images.*, COALESCE((SELECT thumbnail_url FROM media WHERE media.url = gallery_images.url ORDER BY media.id LIMIT 1), '') AS thumbnail_url").
		Order("sort_order ASC, created_at DESC, id ASC").Offset((page - 1) * size).Limit(size).Find(&items).Error
	return items, total, err
}

func (r *SeriesRepo) GetBySlugPage(slug string, page, size int) (*model.Series, int64, error) {
	var series model.Series
	if err := r.db.Where("slug = ?", slug).First(&series).Error; err != nil {
		return nil, 0, err
	}
	query := r.db.Model(&model.Post{}).Joins("JOIN post_series ON post_series.post_id = posts.id").Where("post_series.series_id = ? AND posts.status = 'published'", series.ID)
	var total int64
	if err := query.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	series.Posts = []model.Post{}
	err := query.Select(PostSummaryColumns).Preload("Category").Preload("Tags").
		Order("post_series.sort_order ASC, posts.published_at DESC, posts.id ASC").Offset((page - 1) * size).Limit(size).Find(&series.Posts).Error
	fillCoverThumbnails(r.db, series.Posts)
	return &series, total, err
}

type SeriesProgress struct {
	Position int64 `json:"position"`
	Total    int64 `json:"total"`
}

func (r *SeriesRepo) Progress(slug, post string) (*SeriesProgress, error) {
	var progress SeriesProgress
	result := r.db.Raw(`SELECT position, total FROM (
  SELECT posts.slug, ROW_NUMBER() OVER(ORDER BY post_series.sort_order ASC, posts.published_at DESC, posts.id ASC) AS position, COUNT(*) OVER() AS total
  FROM posts JOIN post_series ON post_series.post_id=posts.id JOIN series ON series.id=post_series.series_id
  WHERE series.slug=? AND posts.status='published'
 ) ranked WHERE slug=?`, slug, post).Scan(&progress)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return &progress, nil
}

func (r *CommentRepo) ListByPostPage(postID uuid.UUID, sort string, parent *uuid.UUID, page, size int) ([]model.Comment, int64, error) {
	query := r.db.Model(&model.Comment{}).Where("comments.post_id = ? AND comments.status = 'approved'", postID)
	if parent == nil {
		query = query.Where("parent_id IS NULL")
	} else {
		query = query.Where("parent_id = ?", *parent)
	}
	var total int64
	if err := query.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	order := "comments.created_at ASC, comments.id ASC"
	if sort == "newest" {
		order = "comments.created_at DESC, comments.id ASC"
	}
	if sort == "reactions" {
		order = "(SELECT COUNT(*) FROM comment_reactions WHERE comment_id=comments.id) DESC, " + order
	}
	items := []model.Comment{}
	err := query.Select("comments.*, (SELECT COUNT(*) FROM comments child WHERE child.parent_id=comments.id AND child.status='approved') AS children_total").
		Order(order).Offset((page - 1) * size).Limit(size).Find(&items).Error
	if err != nil || len(items) == 0 {
		return items, total, err
	}
	// Only roots include an initial reply page. Deeper levels are fetched on demand.
	if parent == nil {
		ids := make([]uuid.UUID, len(items))
		for i, c := range items {
			ids[i] = c.ID
		}
		var children []model.Comment
		err = r.db.Raw(`SELECT ranked.*, (SELECT COUNT(*) FROM comments child WHERE child.parent_id=ranked.id AND child.status='approved') AS children_total FROM (
   SELECT comments.*, ROW_NUMBER() OVER(PARTITION BY parent_id ORDER BY created_at ASC,id ASC) AS row_number
   FROM comments WHERE parent_id IN ? AND post_id=? AND status='approved'
  ) ranked WHERE row_number<=10 ORDER BY created_at ASC,id ASC`, ids, postID).Scan(&children).Error
		if err != nil {
			return nil, 0, err
		}
		byParent := map[uuid.UUID][]model.Comment{}
		for _, c := range children {
			byParent[*c.ParentID] = append(byParent[*c.ParentID], c)
		}
		for i := range items {
			items[i].Children = byParent[items[i].ID]
		}
	}
	return items, total, nil
}
