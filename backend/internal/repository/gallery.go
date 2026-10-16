package repository

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
)

type GalleryRepo struct {
	db *gorm.DB
}

func NewGalleryRepo(db *gorm.DB) *GalleryRepo {
	return &GalleryRepo{db: db}
}

func (r *GalleryRepo) List() ([]model.GalleryImage, error) {
	var items []model.GalleryImage
	err := r.db.Model(&model.GalleryImage{}).
		Select("gallery_images.*, COALESCE(media.thumbnail_url, '') AS thumbnail_url").
		Joins("LEFT JOIN media ON media.url = gallery_images.url").
		Order("gallery_images.sort_order ASC, gallery_images.created_at DESC").Find(&items).Error
	return items, err
}

func (r *GalleryRepo) GetByID(id uuid.UUID) (*model.GalleryImage, error) {
	var item model.GalleryImage
	err := r.db.First(&item, id).Error
	return &item, err
}

func (r *GalleryRepo) FindByURL(url string) (*model.GalleryImage, error) {
	var item model.GalleryImage
	err := r.db.Where("url = ?", url).First(&item).Error
	return &item, err
}

func (r *GalleryRepo) Create(item *model.GalleryImage) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// Serialize appends across requests/processes. Plain gallery reads remain
		// available while order allocation and insertion run in one transaction.
		if err := tx.Exec("LOCK TABLE gallery_images IN SHARE ROW EXCLUSIVE MODE").Error; err != nil {
			return err
		}
		if err := tx.Model(&model.GalleryImage{}).Select("COALESCE(MAX(sort_order), 0) + 1").Scan(&item.SortOrder).Error; err != nil {
			return err
		}
		return tx.Create(item).Error
	})
}

func (r *GalleryRepo) Update(id uuid.UUID, updates map[string]interface{}) error {
	return r.db.Model(&model.GalleryImage{}).Where("id = ?", id).Updates(updates).Error
}

func (r *GalleryRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&model.GalleryImage{}, id).Error
}

type ReorderItem struct {
	ID        uuid.UUID `json:"id"`
	SortOrder int       `json:"sort_order"`
}

func (r *GalleryRepo) Reorder(items []ReorderItem) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		for _, item := range items {
			if err := tx.Model(&model.GalleryImage{}).Where("id = ?", item.ID).Update("sort_order", item.SortOrder).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
