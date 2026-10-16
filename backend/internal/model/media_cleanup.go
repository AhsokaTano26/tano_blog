package model

import (
	"github.com/google/uuid"
	"time"
)

// MediaFileCleanup is a local durable queue. File removal follows the database
// commit, and failures stay here for the next maintenance pass.
type MediaFileCleanup struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Filename  string    `gorm:"size:500;not null"`
	LastError string    `gorm:"type:text"`
	CreatedAt time.Time
	UpdatedAt time.Time
}
