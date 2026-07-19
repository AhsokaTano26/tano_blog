package handler

import (
	"encoding/csv"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
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
		Name                string `json:"name" binding:"required"`
		URL                 string `json:"url" binding:"required"`
		Description         string `json:"description"`
		Avatar              string `json:"avatar"`
		Email               string `json:"email"`
		CfTurnstileResponse string `json:"cf_turnstile_response"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入名称和网站地址"})
		return
	}

	// Turnstile verification
	if !verifyTurnstile(h.db, "link", input.CfTurnstileResponse, c.ClientIP()) {
		c.JSON(http.StatusForbidden, gin.H{"error": "验证失败，请刷新页面重试"})
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

	// Notify admin
	var adminUser model.User
	h.db.Where("role = ?", "admin").First(&adminUser)
	if adminUser.ID != uuid.Nil {
		notifRepo := repository.NewNotificationRepo(h.db)
		notif := &model.Notification{
			UserID:  adminUser.ID,
			Type:    "link_apply",
			Title:   "新友链申请：" + link.Name,
			Content: link.Description,
			Link:    "/admin/links",
		}
		go notifRepo.Create(notif)
	}

	c.JSON(http.StatusCreated, gin.H{"message": "申请已提交，请等待审核"})
}

// AdminList returns all friend links
func (h *FriendLinkHandler) AdminList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	statusFilter := c.Query("status")

	query := h.db.Model(&model.FriendLink{})
	countQuery := h.db.Model(&model.FriendLink{})
	if statusFilter != "" {
		query = query.Where("status = ?", statusFilter)
		countQuery = countQuery.Where("status = ?", statusFilter)
	}

	var total int64
	countQuery.Count(&total)

	var links []model.FriendLink
	if err := query.Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).Find(&links).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取友链列表失败"})
		return
	}
	if links == nil {
		links = []model.FriendLink{}
	}
	c.JSON(http.StatusOK, gin.H{"items": links, "total": total, "page": page, "size": pageSize})
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

func (h *FriendLinkHandler) ExportCSV(c *gin.Context) {
	var items []model.FriendLink
	h.db.Find(&items)

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=friend_links.csv")
	c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})

	w := csv.NewWriter(c.Writer)
	w.Write([]string{"时间", "名称", "URL", "描述", "邮箱", "状态"})
	for _, item := range items {
		w.Write([]string{
			item.CreatedAt.Format("2006-01-02 15:04:05"),
			item.Name,
			item.URL,
			item.Description,
			item.Email,
			item.Status,
		})
	}
	w.Flush()
}
