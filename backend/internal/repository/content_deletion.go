package repository

import (
	"errors"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tano_blog/backend/internal/model"
)

func deleteComments(tx *gorm.DB, ids []uuid.UUID) error {
	if len(ids) == 0 {
		return nil
	}
	if err := tx.Where("comment_id IN ?", ids).Delete(&model.CommentRevision{}).Error; err != nil {
		return err
	}
	if err := tx.Where("comment_id IN ?", ids).Delete(&model.CommentReaction{}).Error; err != nil {
		return err
	}
	return tx.Where("id IN ?", ids).Delete(&model.Comment{}).Error
}

func deletePost(tx *gorm.DB, id uuid.UUID) error {
	// Match editor and series mutations: own the article row before touching
	// its relationships, otherwise a waiting delete can deadlock an editor.
	var post model.Post
	if err := tx.Select("id").Clauses(clause.Locking{Strength: "UPDATE"}).First(&post, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	var commentIDs []uuid.UUID
	if err := tx.Model(&model.Comment{}).Where("post_id = ?", id).Pluck("id", &commentIDs).Error; err != nil {
		return err
	}
	if err := deleteComments(tx, commentIDs); err != nil {
		return err
	}
	for _, table := range []string{"post_tags", "post_series", "post_revisions", "post_reactions"} {
		if err := tx.Table(table).Where("post_id = ?", id).Delete(nil).Error; err != nil {
			return err
		}
	}
	return tx.Delete(&model.Post{}, id).Error
}
