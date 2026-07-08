package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/utils"
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
		CommentCount int64                  `json:"comment_count"`
		PublishedAt *string                `json:"published_at"`
		CreatedAt   string                 `json:"created_at"`
		AuthorName  string                 `json:"author_name"`
		Author      map[string]interface{} `json:"author,omitempty"`
		Category    map[string]interface{} `json:"category,omitempty"`
		Tags        []map[string]interface{} `json:"tags,omitempty"`
		Series      []map[string]interface{} `json:"series,omitempty"`
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
			CommentCount: p.CommentCount,
			AuthorName: p.AuthorName,
		}
		item.CreatedAt = p.CreatedAt.Format("2006-01-02T15:04:05Z")
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
		if p.Author != nil && p.Author.ID != uuid.Nil {
			item.Author = map[string]interface{}{
				"username":     p.Author.Username,
				"display_name": p.Author.DisplayName,
				"avatar_url":   p.Author.AvatarURL,
			}
		}
		for _, t := range p.Tags {
			item.Tags = append(item.Tags, map[string]interface{}{
				"id":   t.ID,
				"name": t.Name,
				"slug": t.Slug,
			})
		}
		for _, s := range p.Series {
			item.Series = append(item.Series, map[string]interface{}{
				"id":   s.ID,
				"name": s.Name,
				"slug": s.Slug,
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
	if c.GetString("role") != "admin" && post.Status != "published" {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}

	// Check password protection
	if post.PasswordHash != "" && c.GetString("user_id") == "" {
		cookieKey := "post_access_" + post.ID.String()
		if cookie, err := c.Cookie(cookieKey); err != nil || cookie != "granted" {
			c.JSON(http.StatusOK, gin.H{
				"post": map[string]interface{}{
					"id":                 post.ID,
					"title":              post.Title,
					"slug":               post.Slug,
					"excerpt":            post.Excerpt,
					"cover_image":        post.CoverImage,
					"category":           post.Category,
					"tags":               post.Tags,
					"author_name":        post.AuthorName,
					"view_count":         post.ViewCount,
					"password_protected": true,
					"password_hint":      post.PasswordHint,
				},
			})
			return
		}
	}

	// Increment view count
	h.repo.IncrementView(post.ID)

	c.JSON(http.StatusOK, gin.H{
		"post": post,
	})
}

// VerifyPassword verifies post password and sets access cookie
func (h *PostHandler) VerifyPassword(c *gin.Context) {
	slug := c.Param("slug")
	post, err := h.repo.GetBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}

	if post.PasswordHash == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文章未设置密码"})
		return
	}

	var input struct {
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if !utils.CheckPassword(input.Password, post.PasswordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "密码错误"})
		return
	}

	cookieKey := "post_access_" + post.ID.String()
	secure := c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https"
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie(cookieKey, "granted", 7*24*3600, "/", "", secure, true)

	c.JSON(http.StatusOK, gin.H{"verified": true})
}

// GetByPreviewToken returns a draft post by preview token
func (h *PostHandler) GetByPreviewToken(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少预览令牌"})
		return
	}

	post, err := h.repo.GetByPreviewToken(token)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "预览链接无效或已过期"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"post": post})
}

// GeneratePreviewToken generates a preview token for a draft post
func (h *PostHandler) GeneratePreviewToken(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	token := uuid.New().String()
	if err := h.repo.Update(id, map[string]interface{}{"preview_token": token}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成预览链接失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": token})
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

// TopViewed returns most viewed posts
func (h *PostHandler) TopViewed(c *gin.Context) {
	limit := 10
	posts, err := h.repo.TopViewed(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取热门文章失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": posts})
}

// CalendarPostsPublic returns only published posts for the calendar view
func (h *PostHandler) CalendarPostsPublic(c *gin.Context) {
	year := c.Query("year")
	month := c.Query("month")
	if year == "" {
		year = time.Now().Format("2006")
	}
	if month == "" {
		month = time.Now().Format("01")
	}

	posts, err := h.repo.CalendarPostsPublic(year, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取日历数据失败"})
		return
	}

	type CalendarPost struct {
		ID    string `json:"id"`
		Title string `json:"title"`
		Slug  string `json:"slug"`
		Date  string `json:"date"`
	}

	result := make([]CalendarPost, 0)
	for _, p := range posts {
		date := ""
		if p.PublishedAt != nil {
			date = p.PublishedAt.Format("2006-01-02")
		}
		result = append(result, CalendarPost{
			ID:    p.ID.String(),
			Title: p.Title,
			Slug:  p.Slug,
			Date:  date,
		})
	}

	c.JSON(http.StatusOK, gin.H{"items": result})
}

func (h *PostHandler) ToggleReaction(c *gin.Context) {
	slug := c.Param("slug")
	post, err := h.repo.GetBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}

	var input struct {
		Emoji string `json:"emoji"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if len([]rune(input.Emoji)) == 0 || len([]rune(input.Emoji)) > 10 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	ipAddress := c.ClientIP()
	active, err := h.repo.ToggleReaction(post.ID, input.Emoji, ipAddress)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"active": active, "emoji": input.Emoji})
}

func (h *PostHandler) AdjacentPosts(c *gin.Context) {
	slug := c.Param("slug")
	prev, next := h.repo.AdjacentPosts(slug)

	type adjacentItem struct {
		Slug  string `json:"slug"`
		Title string `json:"title"`
	}

	var prevResp, nextResp *adjacentItem
	if prev != nil {
		prevResp = &adjacentItem{Slug: prev.Slug, Title: prev.Title}
	}
	if next != nil {
		nextResp = &adjacentItem{Slug: next.Slug, Title: next.Title}
	}

	c.JSON(http.StatusOK, gin.H{
		"prev": prevResp,
		"next": nextResp,
	})
}

func (h *PostHandler) RelatedPosts(c *gin.Context) {
	slug := c.Param("slug")
	posts, err := h.repo.RelatedPosts(slug, 6)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取相关文章失败"})
		return
	}
	if posts == nil {
		posts = []model.Post{}
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

// AdminGet returns a single post by ID for admin
func (h *PostHandler) AdminGet(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	post, err := h.repo.GetByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}

	// Add password_set for frontend (password_hash is json:"-")
	passwordSet := post.PasswordHash != ""
	c.JSON(http.StatusOK, gin.H{
		"post": map[string]interface{}{
			"password_set": passwordSet,
			"id":              post.ID,
			"title":           post.Title,
			"slug":            post.Slug,
			"content":         post.Content,
			"excerpt":         post.Excerpt,
			"cover_image":     post.CoverImage,
			"status":          post.Status,
			"is_top":          post.IsTop,
			"allow_comment":   post.AllowComment,
			"author_name":     post.AuthorName,
			"author_id":       post.AuthorID,
			"editor_id":       post.EditorID,
			"category_id":     post.CategoryID,
			"published_at":    post.PublishedAt,
			"created_at":      post.CreatedAt,
			"updated_at":      post.UpdatedAt,
			"password_hint":   post.PasswordHint,
			"category":        post.Category,
			"author":          post.Author,
		},
	})
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
		AuthorName   string   `json:"author_name"`
		CategoryID   string   `json:"category_id"`
		TagIDs       []string `json:"tag_ids"`
		ScheduledAt  string   `json:"scheduled_at"`
		SeriesID     string   `json:"series_id"`
		Password     string   `json:"password"`
		PasswordHint string   `json:"password_hint"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	editorID, _ := uuid.Parse(c.GetString("user_id"))
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
	// Handle scheduled publish
	if input.ScheduledAt != "" && post.Status == "draft" {
		if t, err := time.Parse("2006-01-02T15:04", input.ScheduledAt); err == nil {
			post.PublishedAt = &t
		}
	}
	post.IsTop = input.IsTop
	post.AllowComment = true
	if !input.AllowComment {
		post.AllowComment = false
	}
	// Author is a free-text field
	post.AuthorName = input.AuthorName
	// Editor is always the current user
	post.EditorID = &editorID
	if input.CategoryID != "" {
		if cid, err := uuid.Parse(input.CategoryID); err == nil {
			post.CategoryID = &cid
		}
	}

	// Handle password protection
	if input.Password != "" {
		if hash, err := utils.HashPassword(input.Password); err == nil {
			post.PasswordHash = hash
		}
		post.PasswordHint = input.PasswordHint
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

	var input struct {
		Title        string   `json:"title"`
		Slug         string   `json:"slug"`
		Content      string   `json:"content"`
		Excerpt      string   `json:"excerpt"`
		CoverImage   string   `json:"cover_image"`
		Status       string   `json:"status"`
		IsTop        *bool    `json:"is_top"`
		AllowComment *bool    `json:"allow_comment"`
		AuthorName   *string  `json:"author_name"`
		CategoryID   *string  `json:"category_id"`
		TagIDs       []string `json:"tag_ids"`
		ScheduledAt  *string  `json:"scheduled_at"`
		SeriesID     *string  `json:"series_id"`
		Password     *string  `json:"password"`
		PasswordHint *string  `json:"password_hint"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	// Save revision before updating
	if input.Title != "" || input.Content != "" || input.Excerpt != "" {
		currentPost, err := h.repo.GetByID(id)
		if err == nil {
			editorID, _ := uuid.Parse(c.GetString("user_id"))
			revision := &model.PostRevision{
				ID:       uuid.New(),
				PostID:   id,
				Title:    currentPost.Title,
				Content:  currentPost.Content,
				Excerpt:  currentPost.Excerpt,
				EditorID: &editorID,
			}
			h.repo.SaveRevision(revision)
		}
	}

	updates := map[string]interface{}{}
	if input.Title != "" {
		updates["title"] = input.Title
	}
	if input.Slug != "" {
		updates["slug"] = input.Slug
	}
	if input.Content != "" {
		updates["content"] = input.Content
	}
	if input.Excerpt != "" {
		updates["excerpt"] = input.Excerpt
	}
	if input.CoverImage != "" {
		updates["cover_image"] = input.CoverImage
	}
	if input.Status != "" {
		updates["status"] = input.Status
		if input.Status == "published" {
			now := time.Now()
			updates["published_at"] = now
		}
	}
	if input.ScheduledAt != nil {
		if *input.ScheduledAt == "" {
			updates["published_at"] = nil
		} else if t, err := time.Parse("2006-01-02T15:04", *input.ScheduledAt); err == nil {
			updates["published_at"] = t
		}
	}
	if input.IsTop != nil {
		updates["is_top"] = *input.IsTop
	}
	if input.AllowComment != nil {
		updates["allow_comment"] = *input.AllowComment
	}
	if input.AuthorName != nil {
		updates["author_name"] = *input.AuthorName
	}
	if input.CategoryID != nil {
		if *input.CategoryID == "" {
			updates["category_id"] = nil
		} else if cid, err := uuid.Parse(*input.CategoryID); err == nil {
			updates["category_id"] = cid
		}
	}

	// Handle password protection
	if input.Password != nil {
		if *input.Password == "" {
			updates["password_hash"] = nil
			updates["password_hint"] = ""
		} else if hash, err := utils.HashPassword(*input.Password); err == nil {
			updates["password_hash"] = hash
			updates["password_hint"] = *input.PasswordHint
		}
	} else if input.PasswordHint != nil {
		updates["password_hint"] = *input.PasswordHint
	}

	// Set editor to current user
	editorID, _ := uuid.Parse(c.GetString("user_id"))
	if editorID != uuid.Nil {
		updates["editor_id"] = editorID
	}

	// Handle tags separately
	if len(input.TagIDs) > 0 {
		var tagUUIDs []uuid.UUID
		for _, tid := range input.TagIDs {
			if parsed, err := uuid.Parse(tid); err == nil {
				tagUUIDs = append(tagUUIDs, parsed)
			}
		}
		if len(tagUUIDs) > 0 {
			h.repo.SetTags(id, tagUUIDs)
		}
	}

	// Handle series (independent of tags)
	if input.SeriesID != nil {
		if *input.SeriesID == "" {
			h.repo.ClearSeries(id)
		} else if sid, err := uuid.Parse(*input.SeriesID); err == nil {
			h.repo.SetSeries(id, sid)
		}
	}

	if err := h.repo.Update(id, updates); err != nil {
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

// BatchDelete deletes multiple posts
func (h *PostHandler) BatchDelete(c *gin.Context) {
	var input struct {
		IDs []string `json:"ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	ids := make([]uuid.UUID, 0, len(input.IDs))
	for _, idStr := range input.IDs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的ID: " + idStr})
			return
		}
		ids = append(ids, id)
	}

	for _, id := range ids {
		if err := h.repo.Delete(id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "批量删除失败"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "批量删除成功"})
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

	if input.Status != "draft" && input.Status != "published" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的状态值"})
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

// BatchUpdateStatus batch updates post statuses
func (h *PostHandler) BatchUpdateStatus(c *gin.Context) {
	var input struct {
		IDs    []string `json:"ids" binding:"required"`
		Status string   `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if input.Status != "draft" && input.Status != "published" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的状态值"})
		return
	}

	ids := make([]uuid.UUID, 0, len(input.IDs))
	for _, idStr := range input.IDs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的ID: " + idStr})
			return
		}
		ids = append(ids, id)
	}

	updates := map[string]interface{}{"status": input.Status}
	if input.Status == "published" {
		now := time.Now()
		updates["published_at"] = now
	}

	if err := h.repo.BatchUpdate(ids, updates); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "批量更新失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "批量状态已更新"})
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

// ListRevisions returns revision history for a post
func (h *PostHandler) ListRevisions(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	revisions, err := h.repo.ListRevisions(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取修订历史失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"items": revisions})
}

// RestoreRevision restores a post to a specific revision
func (h *PostHandler) RestoreRevision(c *gin.Context) {
	revID, err := uuid.Parse(c.Param("revId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	rev, err := h.repo.GetRevision(revID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "修订版本不存在"})
		return
	}

	editorID, _ := uuid.Parse(c.GetString("user_id"))

	// Save current state as a new revision before restoring
	currentPost, err := h.repo.GetByID(rev.PostID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}

	revision := &model.PostRevision{
		ID:       uuid.New(),
		PostID:   currentPost.ID,
		Title:    currentPost.Title,
		Content:  currentPost.Content,
		Excerpt:  currentPost.Excerpt,
		EditorID: &editorID,
	}
	h.repo.SaveRevision(revision)

	// Restore
	updates := map[string]interface{}{
		"title":     rev.Title,
		"content":   rev.Content,
		"excerpt":   rev.Excerpt,
		"editor_id": editorID,
	}
	if err := h.repo.Update(rev.PostID, updates); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "恢复失败"})
		return
	}

	post, _ := h.repo.GetByID(rev.PostID)
	c.JSON(http.StatusOK, gin.H{"post": post})
}

// CalendarPosts returns posts grouped by date for the calendar view
func (h *PostHandler) CalendarPosts(c *gin.Context) {
	year := c.Query("year")
	month := c.Query("month")
	if year == "" {
		year = time.Now().Format("2006")
	}
	if month == "" {
		month = time.Now().Format("01")
	}

	posts, err := h.repo.CalendarPosts(year, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取日历数据失败"})
		return
	}

	type CalendarPost struct {
		ID     string `json:"id"`
		Title  string `json:"title"`
		Slug   string `json:"slug"`
		Status string `json:"status"`
		Date   string `json:"date"`
	}

	result := make([]CalendarPost, 0)
	for _, p := range posts {
		date := p.CreatedAt.Format("2006-01-02")
		if p.PublishedAt != nil {
			date = p.PublishedAt.Format("2006-01-02")
		}
		result = append(result, CalendarPost{
			ID:     p.ID.String(),
			Title:  p.Title,
			Slug:   p.Slug,
			Status: p.Status,
			Date:   date,
		})
	}

	c.JSON(http.StatusOK, gin.H{"items": result})
}

// Export exports all posts as JSON for backup
func (h *PostHandler) Export(c *gin.Context) {
	posts, err := h.repo.ExportAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "导出失败"})
		return
	}

	c.Header("Content-Type", "application/json")
	c.Header("Content-Disposition", "attachment; filename=posts_backup.json")
	c.JSON(http.StatusOK, gin.H{"posts": posts, "exported_at": time.Now().Format(time.RFC3339)})
}
