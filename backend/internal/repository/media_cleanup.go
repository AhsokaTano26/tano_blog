package repository

import (
	"fmt"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"path/filepath"
	"strings"
	"tano_blog/backend/internal/model"
)

func (r *MediaRepo) deleteWithFileCleanup(ids []uuid.UUID) error {
	if len(ids) == 0 {
		return nil
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		var items []model.Media
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id IN ?", ids).Find(&items).Error; err != nil {
			return err
		}
		for _, item := range items {
			filenames := []string{item.Filename}
			if item.ThumbnailURL != "" && strings.HasPrefix(item.ThumbnailURL, "/uploads/") {
				filenames = append(filenames, filepath.Base(item.ThumbnailURL))
			}
			for _, filename := range filenames {
				if filename == "" || filename == "." || filename == ".." || filepath.Base(filename) != filename {
					return fmt.Errorf("invalid media filename: %q", filename)
				}
				if err := tx.Create(&model.MediaFileCleanup{Filename: filename}).Error; err != nil {
					return err
				}
			}
		}
		if err := tx.Table("media_tag_links").Where("media_id IN ?", ids).Delete(nil).Error; err != nil {
			return err
		}
		if err := tx.Where("id IN ?", ids).Delete(&model.Media{}).Error; err != nil {
			return err
		}
		urls := make([]string, 0, len(items))
		for _, item := range items {
			urls = append(urls, item.URL)
		}
		if len(urls) > 0 {
			return tx.Where("url IN ? AND NOT EXISTS (SELECT 1 FROM media WHERE media.url = gallery_images.url)", urls).Delete(&model.GalleryImage{}).Error
		}
		return nil
	})
}

func (r *MediaRepo) PendingFileCleanup(limit int) ([]model.MediaFileCleanup, error) {
	var jobs []model.MediaFileCleanup
	err := r.db.Order("updated_at ASC, id ASC").Limit(limit).Find(&jobs).Error
	return jobs, err
}
func (r *MediaRepo) CompleteFileCleanup(id uuid.UUID) error {
	return r.db.Delete(&model.MediaFileCleanup{}, id).Error
}
func (r *MediaRepo) FailFileCleanup(id uuid.UUID, message string) error {
	return r.db.Model(&model.MediaFileCleanup{}).Where("id = ?", id).Update("last_error", message).Error
}

// FileCleanupInUse also covers shared thumbnails. Dropping an obsolete cleanup
// job is safe: deleting the last media reference enqueues its files again.
func (r *MediaRepo) FileCleanupInUse(filename string) (bool, error) {
	var count int64
	err := r.db.Model(&model.Media{}).Where("filename = ? OR url = ? OR thumbnail_url = ?", filename, "/uploads/"+filename, "/uploads/"+filename).Count(&count).Error
	return count > 0, err
}
