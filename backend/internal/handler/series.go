package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
)

type SeriesHandler struct {
	repo *repository.SeriesRepo
}

func NewSeriesHandler(repo *repository.SeriesRepo) *SeriesHandler {
	return &SeriesHandler{repo: repo}
}

// List public — returns series list with post count
func (h *SeriesHandler) List(c *gin.Context) {
	series, err := h.repo.ListWithCount()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取系列列表失败"})
		return
	}
	if series == nil {
		series = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"items": series})
}

// GetBySlug public — returns series detail with posts
func (h *SeriesHandler) GetBySlug(c *gin.Context) {
	slug := c.Param("slug")
	s, err := h.repo.GetBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "系列不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"series": s})
}

// AdminList — admin series list
func (h *SeriesHandler) AdminList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	total, err := h.repo.Count()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取系列列表失败"})
		return
	}

	var series []map[string]interface{}
	series, err = h.repo.ListPaginatedWithCount(page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取系列列表失败"})
		return
	}
	if series == nil {
		series = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"items": series, "total": total, "page": page, "size": pageSize})
}

// AdminCreate — create series
func (h *SeriesHandler) AdminCreate(c *gin.Context) {
	var input struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		CoverImage  string `json:"cover_image"`
		SortOrder   int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	slug := uuid.New().String()[:8]

	s := &model.Series{
		ID:          uuid.New(),
		Name:        input.Name,
		Slug:        slug,
		Description: input.Description,
		CoverImage:  input.CoverImage,
		SortOrder:   input.SortOrder,
	}
	if err := h.repo.Create(s); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建系列失败"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"series": s})
}

// AdminUpdate — update series
func (h *SeriesHandler) AdminUpdate(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var input struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		CoverImage  string `json:"cover_image"`
		SortOrder   *int   `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	updates := map[string]interface{}{}
	if input.Name != "" {
		updates["name"] = input.Name
	}
	updates["description"] = input.Description
	updates["cover_image"] = input.CoverImage
	if input.SortOrder != nil {
		updates["sort_order"] = *input.SortOrder
	}

	if err := h.repo.Update(id, updates); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新系列失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}

// AdminDelete — delete series
func (h *SeriesHandler) AdminDelete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.repo.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除系列失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

// AdminListPosts — list posts in series (for admin)
func (h *SeriesHandler) AdminListPosts(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	posts, err := h.repo.ListPosts(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "系列不存在"})
		return
	}
	if posts == nil {
		posts = []model.Post{}
	}
	c.JSON(http.StatusOK, gin.H{"items": posts})
}

// AdminSetPosts — batch set posts in series with sort order
func (h *SeriesHandler) AdminSetPosts(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var input struct {
		PostIDs []string `json:"post_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	postIDs := make([]uuid.UUID, 0, len(input.PostIDs))
	for _, pid := range input.PostIDs {
		if parsed, err := uuid.Parse(pid); err == nil {
			postIDs = append(postIDs, parsed)
		}
	}

	if err := h.repo.SetPosts(id, postIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新系列文章失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}
