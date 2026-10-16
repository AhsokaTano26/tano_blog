package repository

import (
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
)

// Keep full content and secrets on detail/edit endpoints only.
const PostSummaryColumns = "posts.id, posts.title, posts.slug, posts.excerpt, posts.cover_image, posts.status, posts.is_top, posts.allow_comment, posts.view_count, posts.category_id, posts.author_id, posts.author_name, posts.editor_id, posts.published_at, posts.created_at, posts.updated_at"

func publicAuthorColumns(db *gorm.DB) *gorm.DB {
	return db.Select("id, username, display_name, avatar_url")
}

func fillCoverThumbnails(db *gorm.DB, posts []model.Post) {
	urls := []string{}
	for _, post := range posts {
		if post.CoverImage != "" {
			urls = append(urls, post.CoverImage)
		}
	}
	if len(urls) == 0 {
		return
	}
	var covers []model.Media
	if err := db.Select("url, thumbnail_url").Where("url IN ? AND thumbnail_url <> ''", urls).Order("id ASC").Find(&covers).Error; err != nil {
		return
	}
	byURL := map[string]string{}
	for _, cover := range covers {
		if byURL[cover.URL] == "" {
			byURL[cover.URL] = cover.ThumbnailURL
		}
	}
	for i := range posts {
		posts[i].CoverThumbnailURL = byURL[posts[i].CoverImage]
	}
}
