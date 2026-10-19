package repository

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tano_blog/backend/internal/model"
)

var ErrInvalidPostAssociation = errors.New("invalid post association")

// PostConflictError carries the locked server snapshot that rejected a stale edit.
type PostConflictError struct{ Current *model.Post }

func (e *PostConflictError) Error() string { return "article was modified by another editor" }

// PostAssociations distinguishes omitted relationships from explicitly cleared ones.
type PostAssociations struct {
	Tags      *[]uuid.UUID
	SeriesID  *uuid.UUID
	SetSeries bool
}

func (r *PostRepo) CreateWithAssociations(post *model.Post, associations PostAssociations) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		repo := NewPostRepo(tx)
		allowComment := post.AllowComment
		if err := repo.Create(post); err != nil {
			return err
		}
		// GORM applies default:true to zero-value booleans during Create.
		if !allowComment {
			if err := tx.Model(post).Update("allow_comment", false).Error; err != nil {
				return err
			}
			post.AllowComment = false
		}
		return repo.applyAssociations(post.ID, associations)
	})
}

func (r *PostRepo) UpdateWithAssociations(id uuid.UUID, updates map[string]interface{}, associations PostAssociations, saveRevision bool) error {
	_, err := r.UpdateWithVersion(id, updates, associations, saveRevision, nil)
	return err
}

// UpdateWithVersion returns the accepted snapshot from inside the transaction.
// Fetching after commit could acknowledge a different writer's newer version.
func (r *PostRepo) UpdateWithVersion(id uuid.UUID, updates map[string]interface{}, associations PostAssociations, saveRevision bool, expected *time.Time) (*model.Post, error) {
	var saved *model.Post
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var current model.Post
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, id).Error; err != nil {
			return err
		}
		repo := NewPostRepo(tx)
		if expected != nil && !expected.Equal(current.UpdatedAt) {
			latest, err := repo.GetByID(id)
			if err != nil {
				return err
			}
			return &PostConflictError{Current: latest}
		}
		status := current.Status
		if next, ok := updates["status"].(string); ok {
			status = next
		}
		if schedule, ok := updates["scheduled_at"]; ok && schedule != nil && status != "draft" {
			return ErrInvalidPostAssociation
		}
		if saveRevision {
			revision := model.PostRevision{PostID: id, Title: current.Title, Content: current.Content, Excerpt: current.Excerpt}
			if editor, ok := updates["editor_id"].(uuid.UUID); ok {
				revision.EditorID = &editor
			}
			if err := tx.Create(&revision).Error; err != nil {
				return err
			}
		}
		if err := repo.Update(id, updates); err != nil {
			return err
		}
		if err := repo.applyAssociations(id, associations); err != nil {
			return err
		}
		var err error
		saved, err = repo.GetByID(id)
		return err
	})
	return saved, err
}

func (r *PostRepo) applyAssociations(id uuid.UUID, associations PostAssociations) error {
	if associations.Tags != nil {
		if err := r.SetTags(id, *associations.Tags); err != nil {
			return err
		}
	}
	if associations.SetSeries {
		if associations.SeriesID == nil {
			return r.ClearSeries(id)
		}
		return r.SetSeries(id, *associations.SeriesID)
	}
	return nil
}

// StatusUpdates preserve the first publication date and cancel any pending schedule.
func PostStatusUpdates(status string, now time.Time) map[string]interface{} {
	updates := map[string]interface{}{"status": status, "scheduled_at": nil}
	if status == "published" {
		updates["published_at"] = gorm.Expr("COALESCE(published_at, ?)", now)
	}
	return updates
}

func (r *PostRepo) PublishScheduled(now time.Time) (int64, error) {
	result := r.db.Model(&model.Post{}).
		Where("status = ? AND scheduled_at IS NOT NULL AND scheduled_at <= ?", "draft", now).
		Updates(PostStatusUpdates("published", now))
	return result.RowsAffected, result.Error
}

func uniqueUUIDs(ids []uuid.UUID) []uuid.UUID {
	seen := make(map[uuid.UUID]bool, len(ids))
	result := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			result = append(result, id)
		}
	}
	return result
}
