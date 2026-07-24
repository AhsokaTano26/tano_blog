package handler

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"net/mail"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/service"
	"tano_blog/backend/internal/utils"
)

type CommentHandler struct {
	repo         *repository.CommentRepo
	db           *gorm.DB
	emailService *service.EmailService
	jwtSecret    string
}

func NewCommentHandler(repo *repository.CommentRepo, db *gorm.DB, emailService *service.EmailService, jwtSecret string) *CommentHandler {
	return &CommentHandler{repo: repo, db: db, emailService: emailService, jwtSecret: jwtSecret}
}

func (h *CommentHandler) lookupPostBySlug(slug string) (*model.Post, error) {
	var post model.Post
	if err := h.db.Where("slug = ? AND status = ?", slug, "published").
		Select("id", "allow_comment", "password_hash").First(&post).Error; err != nil {
		return nil, err
	}
	return &post, nil
}

func (h *CommentHandler) requirePostAccess(c *gin.Context, post *model.Post) bool {
	if post.PasswordHash == "" || c.GetString("role") == "admin" {
		return true
	}
	cookie, _ := c.Cookie("post_access_" + post.ID.String())
	if utils.VerifyResourceToken(cookie, utils.ResourcePost, post.ID.String(), h.jwtSecret) {
		return true
	}
	c.JSON(http.StatusForbidden, gin.H{"error": "请先验证文章密码"})
	return false
}

func (h *CommentHandler) ListByPost(c *gin.Context) {
	slug := c.Param("slug")
	post, err := h.lookupPostBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}
	if !h.requirePostAccess(c, post) {
		return
	}

	comments, err := h.repo.ListByPost(post.ID, c.DefaultQuery("sort", "oldest"))
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
	if !h.requirePostAccess(c, post) {
		return
	}

	if !post.AllowComment {
		c.JSON(http.StatusForbidden, gin.H{"error": "此文章已关闭评论"})
		return
	}

	var input struct {
		ParentID            string `json:"parent_id"`
		Nickname            string `json:"nickname" binding:"required"`
		Email               string `json:"email"`
		Website             string `json:"website"`
		Content             string `json:"content" binding:"required"`
		HpField             string `json:"hp_field"`
		CfTurnstileResponse string `json:"cf_turnstile_response"`
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

	// Turnstile verification
	if !verifyTurnstile(h.db, "comment", input.CfTurnstileResponse, c.ClientIP()) {
		c.JSON(http.StatusForbidden, gin.H{"error": "验证失败，请刷新页面重试"})
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
		Nickname:  strings.ToValidUTF8(input.Nickname, ""),
		Email:     strings.ToValidUTF8(input.Email, ""),
		Website:   strings.ToValidUTF8(input.Website, ""),
		Content:   strings.ToValidUTF8(input.Content, ""),
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
					utils.LogError("panic in new comment notify", "error", r)
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
					utils.LogError("panic in reply notify", "error", r)
				}
			}()
			h.emailService.SendReplyNotify(parent.Email, parent.Nickname, comment.Nickname, comment.Content, post.Title, post.Slug)
		}()
	}

	// Create notification for admin
	var adminUser model.User
	h.db.Where("role = ?", "admin").First(&adminUser)
	if adminUser.ID != uuid.Nil {
		notifRepo := repository.NewNotificationRepo(h.db)
		notif := &model.Notification{
			UserID:  adminUser.ID,
			Type:    "new_comment",
			Title:   "新评论：" + comment.Nickname,
			Content: truncateStr(comment.Content, 100),
			Link:    "/admin/comments",
		}
		go notifRepo.Create(notif)
	}

	// Reply notification for parent commenter
	if comment.ParentID != nil && parent.Email != "" {
		notifRepo := repository.NewNotificationRepo(h.db)
		notif := &model.Notification{
			UserID:  adminUser.ID,
			Type:    "reply",
			Title:   comment.Nickname + " 回复了你的评论",
			Content: truncateStr(comment.Content, 100),
			Link:    fmt.Sprintf("/posts/%s#comment-%s", post.Slug, comment.ID),
		}
		go notifRepo.Create(notif)
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
					utils.LogError("panic in comment approved notify", "error", r)
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
	post, err := h.lookupPostBySlug(c.Param("slug"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}
	if !h.requirePostAccess(c, post) {
		return
	}

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
	if comment.PostID != post.ID {
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

	// Validate emoji is not empty and within reasonable length
	if len([]rune(input.Emoji)) == 0 || len([]rune(input.Emoji)) > 10 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
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

func (h *CommentHandler) ExportCSV(c *gin.Context) {
	status := c.Query("status")
	items, _, err := h.repo.AdminList(1, 10000, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "导出失败"})
		return
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=comments.csv")
	c.Writer.Write([]byte{0xEF, 0xBB, 0xBF}) // UTF-8 BOM

	w := csv.NewWriter(c.Writer)
	w.Write([]string{"时间", "昵称", "邮箱", "网站", "内容", "状态", "IP地址", "文章ID", "父评论ID", "UserAgent"})
	for _, item := range items {
		w.Write([]string{
			item.CreatedAt.Format("2006-01-02 15:04:05"),
			item.Nickname,
			item.Email,
			item.Website,
			item.Content,
			item.Status,
			item.IPAddress,
			item.PostID.String(),
			nullUUIDString(item.ParentID),
			item.UserAgent,
		})
	}
	w.Flush()
}

func (h *CommentHandler) AdminUpdate(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var input struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入评论内容"})
		return
	}

	// Get original comment to save as revision
	var comment model.Comment
	if err := h.db.First(&comment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "评论不存在"})
		return
	}

	// Only save revision if content actually changed
	if comment.Content != input.Content {
		h.repo.SaveRevision(comment.ID, comment.Content)
		h.repo.UpdateContent(comment.ID, input.Content)
	}

	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}

func (h *CommentHandler) ListRevisions(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	revisions, err := h.repo.ListRevisions(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": revisions})
}

func nullUUIDString(id *uuid.UUID) string {
	if id == nil {
		return ""
	}
	return id.String()
}

func truncateStr(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "..."
}
