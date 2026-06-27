package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
)

type CommentHandler struct {
	repo *repository.CommentRepo
	db   *gorm.DB
}

func NewCommentHandler(repo *repository.CommentRepo, db *gorm.DB) *CommentHandler {
	return &CommentHandler{repo: repo, db: db}
}

// lookupPostBySlug finds a post by slug and returns its ID
func (h *CommentHandler) lookupPostBySlug(slug string) (*uuid.UUID, error) {
	var post model.Post
	if err := h.db.Where("slug = ?", slug).Select("id").First(&post).Error; err != nil {
		return nil, err
	}
	return &post.ID, nil
}

func (h *CommentHandler) ListByPost(c *gin.Context) {
	slug := c.Param("slug")
	postID, err := h.lookupPostBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}

	comments, err := h.repo.ListByPost(*postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取评论失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": comments})
}

func (h *CommentHandler) Create(c *gin.Context) {
	slug := c.Param("slug")
	postID, err := h.lookupPostBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}

	var input struct {
		ParentID string `json:"parent_id"`
		Nickname string `json:"nickname" binding:"required"`
		Email    string `json:"email"`
		Website  string `json:"website"`
		Content  string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入评论内容"})
		return
	}

	comment := &model.Comment{
		ID:        uuid.New(),
		PostID:    *postID,
		Nickname:  input.Nickname,
		Email:     input.Email,
		Website:   input.Website,
		Content:   input.Content,
		Status:    "pending",
		IPAddress: c.ClientIP(),
		UserAgent: c.GetHeader("User-Agent"),
	}

	if input.ParentID != "" {
		if pid, err := uuid.Parse(input.ParentID); err == nil {
			comment.ParentID = &pid
		}
	}

	if err := h.repo.Create(comment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "提交评论失败"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"comment": comment})
}

func (h *CommentHandler) AdminList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	status := c.Query("status")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	comments, total, err := h.repo.AdminList(page, pageSize, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取评论列表失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": comments,
		"total": total,
		"page":  page,
		"size":  pageSize,
	})
}

func (h *CommentHandler) UpdateStatus(c *gin.Context) {
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

	validStatuses := map[string]bool{"approved": true, "rejected": true, "spam": true, "pending": true}
	if !validStatuses[input.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的状态"})
		return
	}

	if err := h.repo.UpdateStatus(id, input.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新状态失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "状态已更新"})
}

func (h *CommentHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if err := h.repo.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除评论失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}
