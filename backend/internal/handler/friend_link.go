package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
)

type FriendLinkHandler struct {
	db *gorm.DB
}

func NewFriendLinkHandler(db *gorm.DB) *FriendLinkHandler {
	return &FriendLinkHandler{db: db}
}

// ListPublic returns approved friend links sorted by sort_order
func (h *FriendLinkHandler) ListPublic(c *gin.Context) {
	var links []model.FriendLink
	if err := h.db.Where("status = ?", "approved").
		Order("sort_order ASC, created_at ASC").
		Find(&links).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取友链失败"})
		return
	}
	if links == nil {
		links = []model.FriendLink{}
	}
	c.JSON(http.StatusOK, gin.H{"items": links})
}

// Apply creates a new friend link application with pending status
func (h *FriendLinkHandler) Apply(c *gin.Context) {
	var input struct {
		Name        string `json:"name" binding:"required"`
		URL         string `json:"url" binding:"required"`
		Description string `json:"description"`
		Avatar      string `json:"avatar"`
		Email       string `json:"email"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入名称和网站地址"})
		return
	}

	if len(input.Name) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "名称不能超过100个字符"})
		return
	}
	if len(input.URL) > 500 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "网站地址不能超过500个字符"})
		return
	}
	if len(input.Description) > 500 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "描述不能超过500个字符"})
		return
	}

	link := &model.FriendLink{
		ID:          uuid.New(),
		Name:        strings.ToValidUTF8(input.Name, ""),
		URL:         strings.ToValidUTF8(input.URL, ""),
		Description: strings.ToValidUTF8(input.Description, ""),
		Avatar:      strings.ToValidUTF8(input.Avatar, ""),
		Email:       strings.ToValidUTF8(input.Email, ""),
		Status:      "pending",
	}

	if err := h.db.Create(link).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "提交失败"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "申请已提交，请等待审核"})
}

// AdminList returns all friend links
func (h *FriendLinkHandler) AdminList(c *gin.Context) {
	var links []model.FriendLink
	if err := h.db.Order("created_at DESC").Find(&links).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取友链列表失败"})
		return
	}
	if links == nil {
		links = []model.FriendLink{}
	}
	c.JSON(http.StatusOK, gin.H{"items": links})
}

// AdminCreate creates a friend link directly (admin)
func (h *FriendLinkHandler) AdminCreate(c *gin.Context) {
	var input struct {
		Name        string `json:"name" binding:"required"`
		URL         string `json:"url" binding:"required"`
		Description string `json:"description"`
		Avatar      string `json:"avatar"`
		Email       string `json:"email"`
		Status      string `json:"status"`
		SortOrder   int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	status := input.Status
	if status != "approved" && status != "rejected" {
		status = "pending"
	}

	link := &model.FriendLink{
		ID:          uuid.New(),
		Name:        strings.ToValidUTF8(input.Name, ""),
		URL:         strings.ToValidUTF8(input.URL, ""),
		Description: strings.ToValidUTF8(input.Description, ""),
		Avatar:      strings.ToValidUTF8(input.Avatar, ""),
		Email:       strings.ToValidUTF8(input.Email, ""),
		Status:      status,
		SortOrder:   input.SortOrder,
	}

	if err := h.db.Create(link).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"link": link})
}

// AdminUpdate updates a friend link
func (h *FriendLinkHandler) AdminUpdate(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var input struct {
		Name        string `json:"name"`
		URL         string `json:"url"`
		Description string `json:"description"`
		Avatar      string `json:"avatar"`
		Email       string `json:"email"`
		Status      string `json:"status"`
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
	if input.URL != "" {
		updates["url"] = input.URL
	}
	updates["description"] = input.Description
	updates["avatar"] = input.Avatar
	updates["email"] = input.Email
	if input.Status != "" {
		updates["status"] = input.Status
	}
	if input.SortOrder != nil {
		updates["sort_order"] = *input.SortOrder
	}

	if err := h.db.Model(&model.FriendLink{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}

// AdminUpdateStatus updates the approval status of a friend link
func (h *FriendLinkHandler) AdminUpdateStatus(c *gin.Context) {
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

	validStatuses := map[string]bool{"approved": true, "rejected": true, "pending": true}
	if !validStatuses[input.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的状态"})
		return
	}

	if err := h.db.Model(&model.FriendLink{}).Where("id = ?", id).Update("status", input.Status).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新状态失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "状态已更新"})
}

// AdminDelete deletes a friend link
func (h *FriendLinkHandler) AdminDelete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if err := h.db.Delete(&model.FriendLink{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}
