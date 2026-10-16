package model

import "gorm.io/gorm"

// These indexes mirror the stable ordering and membership predicates used by
// paged endpoints. Run outside transactions, so existing reads/writes continue.
func EnsurePerformanceIndexes(db *gorm.DB) error {
	statements := []string{
		"CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_list_order ON posts (status, created_at DESC, title, id)",
		"CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_created_id ON media (created_at DESC, id)",
		"CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_url ON media (url)",
		"CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gallery_url ON gallery_images (url)",
		"CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gallery_order ON gallery_images (sort_order, created_at DESC, id)",
		"CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_post_parent_order ON comments (post_id, status, parent_id, created_at, id)",
		"CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_logs_created_id_desc ON access_logs (created_at DESC, id DESC)",
		"CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_logs_status_created ON access_logs (status_code, created_at DESC)",
	}
	for _, sql := range statements {
		if err := db.Exec(sql).Error; err != nil {
			return err
		}
	}
	return nil
}
