package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"tano_blog/backend/internal/model"
)

type CategoryHandler struct {
	db *gorm.DB
}

func NewCategoryHandler(db *gorm.DB) *CategoryHandler {
	return &CategoryHandler{db: db}
}

func (h *CategoryHandler) List(c *gin.Context) {
	var cats []model.Category
	h.db.Order("sort_order ASC, name ASC").Find(&cats)
	c.JSON(http.StatusOK, gin.H{"items": cats})
}

func (h *CategoryHandler) GetBySlug(c *gin.Context) {
	slug := c.Param("slug")
	var cat model.Category
	if err := h.db.Where("slug = ?", slug).First(&cat).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "分类不存在"})
		return
	}

	var posts []model.Post
	h.db.Where("category_id = ? AND status = ?", cat.ID, "published").
		Select("id, title, slug, excerpt, cover_image, published_at, view_count").
		Order("published_at DESC").Find(&posts)

	c.JSON(http.StatusOK, gin.H{"category": cat, "posts": posts})
}

func (h *CategoryHandler) Create(c *gin.Context) {
	var input struct {
		Name        string `json:"name" binding:"required"`
		Slug        string `json:"slug" binding:"required"`
		Description string `json:"description"`
		SortOrder   int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	cat := &model.Category{
		ID:          uuid.New(),
		Name:        input.Name,
		Slug:        input.Slug,
		Description: input.Description,
		SortOrder:   input.SortOrder,
	}
	if err := h.db.Create(cat).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建分类失败"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"category": cat})
}

func (h *CategoryHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var input struct {
		Name        string `json:"name"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
		SortOrder   *int   `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	updates := map[string]interface{}{
		"updated_at": time.Now(),
	}
	if input.Name != "" {
		updates["name"] = input.Name
	}
	if input.Slug != "" {
		updates["slug"] = input.Slug
	}
	updates["description"] = input.Description
	if input.SortOrder != nil {
		updates["sort_order"] = *input.SortOrder
	}

	if err := h.db.Model(&model.Category{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新分类失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}

func (h *CategoryHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var count int64
	h.db.Model(&model.Post{}).Where("category_id = ?", id).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该分类下还有文章，无法删除"})
		return
	}

	h.db.Delete(&model.Category{}, id)
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

type TagHandler struct {
	db *gorm.DB
}

func NewTagHandler(db *gorm.DB) *TagHandler {
	return &TagHandler{db: db}
}

func (h *TagHandler) List(c *gin.Context) {
	var tags []model.Tag
	h.db.Order("name ASC").Find(&tags)
	c.JSON(http.StatusOK, gin.H{"items": tags})
}

func (h *TagHandler) GetBySlug(c *gin.Context) {
	slug := c.Param("slug")
	var tag model.Tag
	if err := h.db.Where("slug = ?", slug).First(&tag).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "标签不存在"})
		return
	}

	var posts []model.Post
	h.db.Joins("JOIN post_tags ON post_tags.post_id = posts.id").
		Where("post_tags.tag_id = ? AND posts.status = ?", tag.ID, "published").
		Select("posts.id, posts.title, posts.slug, posts.excerpt, posts.cover_image, posts.published_at, posts.view_count").
		Order("posts.published_at DESC").Find(&posts)

	c.JSON(http.StatusOK, gin.H{"tag": tag, "posts": posts})
}

func (h *TagHandler) Create(c *gin.Context) {
	var input struct {
		Name string `json:"name" binding:"required"`
		Slug string `json:"slug" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	tag := &model.Tag{ID: uuid.New(), Name: input.Name, Slug: input.Slug}
	if err := h.db.Create(tag).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建标签失败"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"tag": tag})
}

func (h *TagHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var input struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	updates := map[string]interface{}{}
	if input.Name != "" {
		updates["name"] = input.Name
	}
	if input.Slug != "" {
		updates["slug"] = input.Slug
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无有效更新字段"})
		return
	}

	if err := h.db.Model(&model.Tag{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新标签失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}

func (h *TagHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	h.db.Delete(&model.Tag{}, id)
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}
