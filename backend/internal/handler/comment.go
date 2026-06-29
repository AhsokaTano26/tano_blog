package handler

import (
	"log"
	"net/http"
	"net/mail"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/service"
)

type CommentHandler struct {
	repo         *repository.CommentRepo
	db           *gorm.DB
	emailService *service.EmailService
}

func NewCommentHandler(repo *repository.CommentRepo, db *gorm.DB, emailService *service.EmailService) *CommentHandler {
	return &CommentHandler{repo: repo, db: db, emailService: emailService}
}

func (h *CommentHandler) lookupPostBySlug(slug string) (*model.Post, error) {
	var post model.Post
	if err := h.db.Where("slug = ?", slug).Select("id", "allow_comment").First(&post).Error; err != nil {
		return nil, err
	}
	return &post, nil
}

func (h *CommentHandler) ListByPost(c *gin.Context) {
	slug := c.Param("slug")
	post, err := h.lookupPostBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}

	comments, err := h.repo.ListByPost(post.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取评论失败"})
		return
	}

	// Collect all comment IDs for batch reaction query
	var allCommentIDs []uuid.UUID
	var collectIDs func(c model.Comment)
	collectIDs = func(c model.Comment) {
		allCommentIDs = append(allCommentIDs, c.ID)
		for _, child := range c.Children {
			collectIDs(child)
		}
	}
	for _, c := range comments {
		collectIDs(c)
	}

	// Get reaction counts
	reactions, _ := h.repo.GetReactions(allCommentIDs)
	// Get current user's reactions
	ipAddress := c.ClientIP()
	userReactions, _ := h.repo.GetUserReactions(allCommentIDs, ipAddress)

	type publicComment struct {
		ID         uuid.UUID       `json:"id"`
		PostID     uuid.UUID       `json:"post_id"`
		ParentID   *uuid.UUID      `json:"parent_id"`
		Nickname   string          `json:"nickname"`
		Website    string          `json:"website"`
		Content    string          `json:"content"`
		Status     string          `json:"status"`
		Country    string          `json:"country"`
		City       string          `json:"city"`
		CreatedAt  string          `json:"created_at"`
		Children   []publicComment `json:"children,omitempty"`
		Reactions  map[string]int  `json:"reactions"`
		UserEmojis []string        `json:"user_emojis,omitempty"`
	}

	var convert func(c model.Comment) publicComment
	convert = func(c model.Comment) publicComment {
		pc := publicComment{
			ID:         c.ID,
			PostID:     c.PostID,
			ParentID:   c.ParentID,
			Nickname:   c.Nickname,
			Website:    c.Website,
			Content:    c.Content,
			Status:     c.Status,
			Country:    c.Country,
			City:       c.City,
			CreatedAt:  c.CreatedAt.Format("2006-01-02T15:04:05Z"),
			Reactions:  reactions[c.ID.String()],
			UserEmojis: userReactions[c.ID.String()],
		}
		if pc.Reactions == nil {
			pc.Reactions = map[string]int{}
		}
		if pc.UserEmojis == nil {
			pc.UserEmojis = []string{}
		}
		for _, child := range c.Children {
			pc.Children = append(pc.Children, convert(child))
		}
		return pc
	}

	result := make([]publicComment, len(comments))
	for i, c := range comments {
		result[i] = convert(c)
	}

	c.JSON(http.StatusOK, gin.H{"items": result})
}
func (h *CommentHandler) Create(c *gin.Context) {
	slug := c.Param("slug")
	post, err := h.lookupPostBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}

	if !post.AllowComment {
		c.JSON(http.StatusForbidden, gin.H{"error": "此文章已关闭评论"})
		return
	}

	var input struct {
		ParentID string `json:"parent_id"`
		Nickname string `json:"nickname" binding:"required"`
		Email    string `json:"email"`
		Website  string `json:"website"`
		Content  string `json:"content" binding:"required"`
		HpField  string `json:"hp_field"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入评论内容"})
		return
	}

	// Honeypot check - bots fill hidden fields
	if input.HpField != "" {
		c.JSON(http.StatusCreated, gin.H{"comment": "ok"})
		return
	}

	if len(input.Nickname) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "昵称不能为空"})
		return
	}
	if len(input.Nickname) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "昵称不能超过100个字符"})
		return
	}
	if len(input.Content) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "评论内容不能为空"})
		return
	}
	if len(input.Content) > 5000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "评论内容不能超过5000个字符"})
		return
	}
	if len(input.Email) > 255 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "邮箱不能超过255个字符"})
		return
	}
	if input.Email != "" {
		if _, err := mail.ParseAddress(input.Email); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "邮箱格式不正确"})
			return
		}
	}
	if len(input.Website) > 500 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "网站地址不能超过500个字符"})
		return
	}

	comment := &model.Comment{
		ID:        uuid.New(),
		PostID:    post.ID,
		Nickname:  input.Nickname,
		Email:     input.Email,
		Website:   input.Website,
		Content:   input.Content,
		Status:    "pending",
		IPAddress: c.ClientIP(),
		UserAgent: c.GetHeader("User-Agent"),
	}

	var parent model.Comment
	if input.ParentID != "" {
		pid, err := uuid.Parse(input.ParentID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的父评论ID"})
			return
		}
		// Verify parent comment belongs to the same post
		var parent model.Comment
		if err := h.db.Where("id = ? AND post_id = ?", pid, post.ID).First(&parent).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "父评论不存在"})
			return
		}
		comment.ParentID = &pid
	}

	if err := h.repo.Create(comment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "提交评论失败"})
		return
	}

	// Notify admin of new comment (fire-and-forget)
	if h.emailService != nil {
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[Email] panic in new comment notify: %v", r)
				}
			}()
			h.emailService.SendNewCommentNotify(comment.Nickname, comment.Content, post.Title, post.Slug)
		}()
	}

	// Notify parent commenter of reply (fire-and-forget)
	if h.emailService != nil && comment.ParentID != nil && parent.Email != "" {
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[Email] panic in reply notify: %v", r)
				}
			}()
			h.emailService.SendReplyNotify(parent.Email, parent.Nickname, comment.Nickname, comment.Content, post.Title, post.Slug)
		}()
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

	// Fetch comment before update for notification
	var comment model.Comment
	var post model.Post
	if input.Status == "approved" && h.emailService != nil {
		h.db.First(&comment, id)
		h.db.Select("title, slug").First(&post, comment.PostID)
	}

	if err := h.repo.UpdateStatus(id, input.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新状态失败"})
		return
	}

	// Notify commenter when approved (fire-and-forget)
	if input.Status == "approved" && h.emailService != nil && comment.Email != "" {
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[Email] panic in comment approved notify: %v", r)
				}
			}()
			h.emailService.SendCommentApprovedNotify(comment.Email, comment.Nickname, post.Title, post.Slug)
		}()
	}

	c.JSON(http.StatusOK, gin.H{"message": "状态已更新"})
}

func (h *CommentHandler) BatchUpdateStatus(c *gin.Context) {
	var input struct {
		IDs    []string `json:"ids" binding:"required"`
		Status string   `json:"status" binding:"required"`
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

	for _, idStr := range input.IDs {
		if id, err := uuid.Parse(idStr); err == nil {
			h.repo.UpdateStatus(id, input.Status)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "批量更新成功"})
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



func (h *CommentHandler) ToggleReaction(c *gin.Context) {
	commentID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	// Verify comment exists
	var comment model.Comment
	if err := h.db.First(&comment, commentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "评论不存在"})
		return
	}

	var input struct {
		Emoji string `json:"emoji" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	// Validate emoji is in preset list
	validEmojis := map[string]bool{"👍": true, "❤️": true, "😂": true, "😮": true, "😢": true, "🙏": true}
	if !validEmojis[input.Emoji] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的表情"})
		return
	}

	ipAddress := c.ClientIP()
	active, err := h.repo.ToggleReaction(commentID, input.Emoji, ipAddress)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"active": active, "emoji": input.Emoji})
}