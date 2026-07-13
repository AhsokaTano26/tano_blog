package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
)

type GalleryHandler struct {
	repo *repository.GalleryRepo
}

func NewGalleryHandler(repo *repository.GalleryRepo) *GalleryHandler {
	return &GalleryHandler{repo: repo}
}

// List — 公开和管理端通用
func (h *GalleryHandler) List(c *gin.Context) {
	items, err := h.repo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取图片列表失败"})
		return
	}
	if items == nil {
		items = []model.GalleryImage{}
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

// Create — 管理端新增
func (h *GalleryHandler) Create(c *gin.Context) {
	var input struct {
		URL         string `json:"url" binding:"required"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Width       int    `json:"width"`
		Height      int    `json:"height"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	// 获取当前最大 sort_order
	items, _ := h.repo.List()
	maxOrder := 0
	for _, item := range items {
		if item.SortOrder > maxOrder {
			maxOrder = item.SortOrder
		}
	}

	img := &model.GalleryImage{
		ID:          uuid.New(),
		URL:         input.URL,
		Title:       input.Title,
		Description: input.Description,
		Width:       input.Width,
		Height:      input.Height,
		SortOrder:   maxOrder + 1,
	}
	if err := h.repo.Create(img); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"image": img})
}

// Update — 管理端更新
func (h *GalleryHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var input struct {
		URL         string `json:"url"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Width       int    `json:"width"`
		Height      int    `json:"height"`
		SortOrder   *int   `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	updates := map[string]interface{}{}
	if input.URL != "" {
		updates["url"] = input.URL
	}
	updates["title"] = input.Title
	updates["description"] = input.Description
	updates["width"] = input.Width
	updates["height"] = input.Height
	if input.SortOrder != nil {
		updates["sort_order"] = *input.SortOrder
	}

	if err := h.repo.Update(id, updates); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}

// Delete — 管理端删除
func (h *GalleryHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.repo.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

// Reorder — 批量更新排序
func (h *GalleryHandler) Reorder(c *gin.Context) {
	var input struct {
		Items []repository.ReorderItem `json:"items" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.repo.Reorder(input.Items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "排序更新失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}
