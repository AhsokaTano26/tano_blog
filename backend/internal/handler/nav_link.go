package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tano_blog/backend/internal/model"
)

type NavLinkHandler struct {
	db *gorm.DB
}

func NewNavLinkHandler(db *gorm.DB) *NavLinkHandler {
	return &NavLinkHandler{db: db}
}

// ListPublic returns all nav links sorted by sort_order
func (h *NavLinkHandler) ListPublic(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	var links []model.NavLink
	if err := h.db.Order("sort_order ASC, created_at ASC").Find(&links).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取导航失败"})
		return
	}
	if links == nil {
		links = []model.NavLink{}
	}
	c.JSON(http.StatusOK, gin.H{"items": links})
}

// AdminList returns all nav links
func (h *NavLinkHandler) AdminList(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	var links []model.NavLink
	if err := h.db.Order("sort_order ASC, created_at ASC").Find(&links).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取导航失败"})
		return
	}
	if links == nil {
		links = []model.NavLink{}
	}
	c.JSON(http.StatusOK, gin.H{"items": links})
}

// AdminCreate creates a nav link
func (h *NavLinkHandler) AdminCreate(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	var input struct {
		Title     string `json:"title" binding:"required"`
		URL       string `json:"url" binding:"required"`
		SortOrder int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	link := &model.NavLink{
		ID:        uuid.New(),
		Title:     input.Title,
		URL:       input.URL,
		SortOrder: input.SortOrder,
	}
	if err := h.db.Create(link).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建导航失败"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"item": link})
}

// AdminUpdate updates a nav link
func (h *NavLinkHandler) AdminUpdate(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var link model.NavLink
	if err := h.db.First(&link, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "导航不存在"})
		return
	}

	var input struct {
		Title     string `json:"title"`
		URL       string `json:"url"`
		SortOrder *int   `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	updates := map[string]interface{}{}
	if input.Title != "" {
		updates["title"] = input.Title
	}
	if input.URL != "" {
		updates["url"] = input.URL
	}
	if input.SortOrder != nil {
		updates["sort_order"] = *input.SortOrder
	}

	if err := h.db.Model(&link).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新导航失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}

// AdminDelete deletes a nav link
func (h *NavLinkHandler) AdminDelete(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if err := h.db.Delete(&model.NavLink{}, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除导航失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

// AdminReorder batch updates sort_order for all nav links
func (h *NavLinkHandler) AdminReorder(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	var input struct {
		IDs []string `json:"ids" binding:"required,min=1"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	ids := make([]uuid.UUID, len(input.IDs))
	seen := make(map[uuid.UUID]bool, len(ids))
	for i, idStr := range input.IDs {
		id, err := uuid.Parse(idStr)
		if err != nil || seen[id] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "导航ID无效或重复"})
			return
		}
		ids[i] = id
		seen[id] = true
	}
	err := h.db.Transaction(func(tx *gorm.DB) error {
		var links []model.NavLink
		if err := tx.Select("id").Clauses(clause.Locking{Strength: "UPDATE"}).Where("id IN ?", ids).Find(&links).Error; err != nil {
			return err
		}
		if len(links) != len(ids) {
			return gorm.ErrRecordNotFound
		}
		for i, id := range ids {
			result := tx.Model(&model.NavLink{}).Where("id = ?", id).Update("sort_order", i)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return gorm.ErrRecordNotFound
			}
		}
		return nil
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "导航不存在"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新排序失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新排序"})
}
