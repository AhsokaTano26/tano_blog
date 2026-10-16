package repository

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"tano_blog/backend/internal/model"
	"time"
)

type logCursor struct {
	ID    uuid.UUID `json:"id"`
	At    time.Time `json:"at"`
	Total int64     `json:"total"`
}

func EncodeLogCursor(logs []model.AccessLog, total int64, size int) string {
	if len(logs) < size || len(logs) == 0 {
		return ""
	}
	last := logs[len(logs)-1]
	data, _ := json.Marshal(logCursor{last.ID, last.CreatedAt, total})
	return base64.RawURLEncoding.EncodeToString(data)
}

func decodeLogCursor(raw string) (*logCursor, error) {
	if len(raw) > 512 {
		return nil, fmt.Errorf("invalid cursor")
	}
	data, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return nil, err
	}
	var cursor logCursor
	if err = json.Unmarshal(data, &cursor); err != nil {
		return nil, err
	}
	if cursor.ID == uuid.Nil || cursor.At.IsZero() || cursor.Total < 0 {
		return nil, fmt.Errorf("invalid cursor")
	}
	return &cursor, nil
}
