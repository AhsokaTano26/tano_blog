package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
)

type PostHandler struct {
	repo *repository.PostRepo
}

func NewPostHandler(repo *repository.PostRepo) *PostHandler {
	return &PostHandler{repo: repo}
}

// ListPublic returns published posts with pagination
func (h *PostHandler) ListPublic(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))
	category := c.Query("category")
	tag := c.Query("tag")
	search := c.Query("search")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 10
	}

	posts, total, err := h.repo.ListPublic(page, pageSize, category, tag, search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取文章列表失败"})
		return
	}

	// Map posts to a simpler response format
	type PostItem struct {
		ID          uuid.UUID              `json:"id"`
		Title       string                 `json:"title"`
		Slug        string                 `json:"slug"`
		Excerpt     string                 `json:"excerpt"`
		CoverImage  string                 `json:"cover_image"`
		ViewCount   int64                  `json:"view_count"`
		PublishedAt *string                `json:"published_at"`
		Category    map[string]interface{} `json:"category,omitempty"`
		Tags        []map[string]interface{} `json:"tags,omitempty"`
	}

	items := make([]PostItem, 0, len(posts))
	for _, p := range posts {
		item := PostItem{
			ID:         p.ID,
			Title:      p.Title,
			Slug:       p.Slug,
			Excerpt:    p.Excerpt,
			CoverImage: p.CoverImage,
			ViewCount:  p.ViewCount,
		}
		if p.PublishedAt != nil {
			s := p.PublishedAt.Format("2006-01-02T15:04:05Z")
			item.PublishedAt = &s
		}
		if p.Category != nil {
			item.Category = map[string]interface{}{
				"id":   p.Category.ID,
				"name": p.Category.Name,
				"slug": p.Category.Slug,
			}
		}
		for _, t := range p.Tags {
			item.Tags = append(item.Tags, map[string]interface{}{
				"id":   t.ID,
				"name": t.Name,
				"slug": t.Slug,
			})
		}
		items = append(items, item)
	}

	c.JSON(http.StatusOK, gin.H{
		"items": items,
		"total": total,
		"page":  page,
		"size":  pageSize,
	})
}

// GetBySlug returns a single post by slug
func (h *PostHandler) GetBySlug(c *gin.Context) {
	slug := c.Param("slug")
	post, err := h.repo.GetBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}

	// Only return published posts for public API
	if c.GetString("user_id") == "" && post.Status != "published" {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}

	// Increment view count
	h.repo.IncrementView(post.ID)

	c.JSON(http.StatusOK, gin.H{
		"post": post,
	})
}

// TopPosts returns top/pinned posts
func (h *PostHandler) TopPosts(c *gin.Context) {
	posts, err := h.repo.TopPosts()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取置顶文章失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": posts})
}

// Archive returns posts grouped by year/month
func (h *PostHandler) Archive(c *gin.Context) {
	items, err := h.repo.Archive()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取归档失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

// AdminList returns all posts (including drafts) for admin
func (h *PostHandler) AdminList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	status := c.Query("status")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	posts, total, err := h.repo.AdminList(page, pageSize, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取文章列表失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": posts,
		"total": total,
		"page":  page,
		"size":  pageSize,
	})
}

// Create creates a new post
func (h *PostHandler) Create(c *gin.Context) {
	var input struct {
		Title        string   `json:"title" binding:"required"`
		Slug         string   `json:"slug" binding:"required"`
		Content      string   `json:"content"`
		Excerpt      string   `json:"excerpt"`
		CoverImage   string   `json:"cover_image"`
		Status       string   `json:"status"`
		IsTop        bool     `json:"is_top"`
		AllowComment bool     `json:"allow_comment"`
		CategoryID   string   `json:"category_id"`
		TagIDs       []string `json:"tag_ids"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	authorID, _ := uuid.Parse(c.GetString("user_id"))
	post := &model.Post{}
	// Map input to post model
	post.Title = input.Title
	post.Slug = input.Slug
	post.Content = input.Content
	post.Excerpt = input.Excerpt
	post.CoverImage = input.CoverImage
	post.Status = "draft"
	if input.Status == "published" {
		post.Status = "published"
		now := time.Now()
		post.PublishedAt = &now
	}
	post.IsTop = input.IsTop
	post.AllowComment = true
	if !input.AllowComment {
		post.AllowComment = false
	}
	post.AuthorID = authorID
	if input.CategoryID != "" {
		if cid, err := uuid.Parse(input.CategoryID); err == nil {
			post.CategoryID = &cid
		}
	}

	post.ID = uuid.New()
	if err := h.repo.Create(post); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建文章失败"})
		return
	}

	// Set tags
	if len(input.TagIDs) > 0 {
		var tagIDs []uuid.UUID
		for _, tid := range input.TagIDs {
			if id, err := uuid.Parse(tid); err == nil {
				tagIDs = append(tagIDs, id)
			}
		}
		if len(tagIDs) > 0 {
			h.repo.SetTags(post.ID, tagIDs)
		}
	}

	c.JSON(http.StatusCreated, gin.H{"post": post})
}

// Update updates a post
func (h *PostHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var input map[string]interface{}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	// Handle publish action
	if status, ok := input["status"]; ok && status == "published" {
		now := time.Now()
		input["published_at"] = now
	}
	// Handle tags separately
	if tagIDs, ok := input["tag_ids"]; ok {
		delete(input, "tag_ids")
		if ids, ok := tagIDs.([]interface{}); ok {
			var tagUUIDs []uuid.UUID
			for _, tid := range ids {
				if idStr, ok := tid.(string); ok {
					if parsed, err := uuid.Parse(idStr); err == nil {
						tagUUIDs = append(tagUUIDs, parsed)
					}
				}
			}
			if len(tagUUIDs) > 0 {
				h.repo.SetTags(id, tagUUIDs)
			}
		}
	}

	if err := h.repo.Update(id, input); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新文章失败"})
		return
	}

	post, _ := h.repo.GetByID(id)
	c.JSON(http.StatusOK, gin.H{"post": post})
}

// Delete deletes a post
func (h *PostHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if err := h.repo.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除文章失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

// UpdateStatus updates post status (publish/draft)
func (h *PostHandler) UpdateStatus(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var input struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	updates := map[string]interface{}{"status": input.Status}
	if input.Status == "published" {
		now := time.Now()
		updates["published_at"] = now
	}

	if err := h.repo.Update(id, updates); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新状态失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "状态已更新"})
}

// ToggleTop toggles the top/pinned status
func (h *PostHandler) ToggleTop(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var input struct {
		IsTop bool `json:"is_top"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if err := h.repo.Update(id, map[string]interface{}{"is_top": input.IsTop}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}
