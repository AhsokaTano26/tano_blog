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
	err := r.db.Order("sort_order ASC, created_at DESC").Find(&items).Error
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
	return r.db.Create(item).Error
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
	for _, item := range items {
		if err := r.db.Model(&model.GalleryImage{}).Where("id = ?", item.ID).Update("sort_order", item.SortOrder).Error; err != nil {
			return err
		}
	}
	return nil
}
