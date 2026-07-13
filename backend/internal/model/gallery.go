package model

import (
	"time"

	"github.com/google/uuid"
)

type GalleryImage struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	URL         string    `gorm:"type:text;not null" json:"url"`
	Title       string    `gorm:"type:varchar(255)" json:"title"`
	Description string    `gorm:"type:text" json:"description"`
	Width       int       `gorm:"default:0" json:"width"`
	Height      int       `gorm:"default:0" json:"height"`
	SortOrder   int       `gorm:"default:0;index" json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
