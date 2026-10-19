package repository

import (
	"errors"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tano_blog/backend/internal/model"
)

var errSeriesMembershipChanged = errors.New("series membership changed concurrently; retry the operation")

// withLockedSeriesMembers follows the article editor's post -> association lock
// order. All affected posts are locked in UUID order before taking the series
// row lock, which prevents new foreign-key references until this transaction
// commits. Never acquire additional post locks while holding the series lock:
// an editor might already own that post and be waiting to reference the series.
func (r *SeriesRepo) withLockedSeriesMembers(seriesID uuid.UUID, requested []uuid.UUID, missingOK bool, mutate func(*gorm.DB, []model.PostSeries) error) error {
	for attempt := 0; attempt < 8; attempt++ {
		err := r.db.Transaction(func(tx *gorm.DB) error {
			var initial []model.PostSeries
			if err := tx.Where("series_id = ?", seriesID).Find(&initial).Error; err != nil {
				return err
			}
			ids := make([]uuid.UUID, 0, len(requested)+len(initial))
			ids = append(ids, requested...)
			for _, member := range initial {
				ids = append(ids, member.PostID)
			}
			ids = uniqueUUIDs(ids)
			var locked []model.Post
			if len(ids) > 0 {
				if err := tx.Select("id").Where("id IN ?", ids).Order("id ASC").Clauses(clause.Locking{Strength: "UPDATE"}).Find(&locked).Error; err != nil {
					return err
				}
			}
			lockedIDs := make(map[uuid.UUID]bool, len(locked))
			for _, post := range locked {
				lockedIDs[post.ID] = true
			}
			for _, id := range requested {
				if !lockedIDs[id] {
					return ErrInvalidPostAssociation
				}
			}
			var series model.Series
			if err := tx.Select("id").Clauses(clause.Locking{Strength: "UPDATE"}).First(&series, seriesID).Error; err != nil {
				if missingOK && errors.Is(err, gorm.ErrRecordNotFound) {
					return nil
				}
				return err
			}
			var current []model.PostSeries
			if err := tx.Where("series_id = ?", seriesID).Find(&current).Error; err != nil {
				return err
			}
			for _, member := range current {
				if !lockedIDs[member.PostID] {
					// A previously unseen editor addition committed between the
					// first read and the series lock. Restart to lock it in order.
					return errSeriesMembershipChanged
				}
			}
			return mutate(tx, current)
		})
		if !errors.Is(err, errSeriesMembershipChanged) {
			return err
		}
	}
	return errSeriesMembershipChanged
}

func changedSeriesMembers(current []model.PostSeries, requested []uuid.UUID) []uuid.UUID {
	previous := make(map[uuid.UUID]int, len(current))
	for _, member := range current {
		previous[member.PostID] = member.SortOrder
	}
	changed := make([]uuid.UUID, 0, len(current)+len(requested))
	for order, id := range requested {
		oldOrder, exists := previous[id]
		if !exists || oldOrder != order {
			changed = append(changed, id)
		}
		delete(previous, id)
	}
	for id := range previous {
		changed = append(changed, id)
	}
	return changed
}

func advanceSeriesMemberVersions(tx *gorm.DB, ids []uuid.UUID) error {
	if len(ids) == 0 {
		return nil
	}
	return tx.Model(&model.Post{}).Where("id IN ?", ids).
		UpdateColumn("updated_at", gorm.Expr("GREATEST(clock_timestamp(), updated_at + interval '1 microsecond')")).Error
}
