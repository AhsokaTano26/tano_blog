package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/utils"
)

// optionalString preserves the difference between an omitted property and null.
// Both null and an empty string explicitly clear nullable editor fields.
type optionalString struct {
	Present bool
	Value   string
}

func (v *optionalString) UnmarshalJSON(data []byte) error {
	v.Present = true
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		v.Value = ""
		return nil
	}
	return json.Unmarshal(data, &v.Value)
}

func parsePostIDs(values []string) ([]uuid.UUID, error) {
	ids := make([]uuid.UUID, 0, len(values))
	for _, value := range values {
		id, err := uuid.Parse(value)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}
func parseOptionalPostID(value string) (*uuid.UUID, error) {
	if value == "" {
		return nil, nil
	}
	id, err := uuid.Parse(value)
	if err != nil {
		return nil, err
	}
	return &id, nil
}
func postWriteError(c *gin.Context, err error, message string) {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
	case errors.Is(err, repository.ErrInvalidPostAssociation):
		c.JSON(http.StatusBadRequest, gin.H{"error": "标签、系列或定时发布设置无效"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": message})
	}
}

func (h *PostHandler) Create(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	var input struct {
		Title        string   `json:"title" binding:"required"`
		Slug         string   `json:"slug" binding:"required"`
		Content      string   `json:"content"`
		Excerpt      string   `json:"excerpt"`
		CoverImage   string   `json:"cover_image"`
		Status       string   `json:"status" binding:"omitempty,oneof=draft published"`
		IsTop        bool     `json:"is_top"`
		AllowComment *bool    `json:"allow_comment"`
		AuthorName   string   `json:"author_name"`
		CategoryID   string   `json:"category_id"`
		TagIDs       []string `json:"tag_ids"`
		ScheduledAt  string   `json:"scheduled_at"`
		SeriesID     string   `json:"series_id"`
		Password     string   `json:"password"`
		PasswordHint string   `json:"password_hint"`
		CreatedAt    string   `json:"created_at"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": "参数错误"})
		return
	}
	if len(input.Password) > 72 {
		c.JSON(400, gin.H{"error": "文章密码不能超过 72 字节"})
		return
	}
	category, err := parseOptionalPostID(input.CategoryID)
	if err != nil {
		c.JSON(400, gin.H{"error": "分类无效"})
		return
	}
	series, err := parseOptionalPostID(input.SeriesID)
	if err != nil {
		c.JSON(400, gin.H{"error": "系列无效"})
		return
	}
	tags, err := parsePostIDs(input.TagIDs)
	if err != nil {
		c.JSON(400, gin.H{"error": "标签无效"})
		return
	}
	post := &model.Post{ID: uuid.New(), Title: input.Title, Slug: input.Slug, Content: input.Content, Excerpt: input.Excerpt, CoverImage: input.CoverImage, Status: "draft", IsTop: input.IsTop, AllowComment: true, AuthorName: input.AuthorName, CategoryID: category}
	if input.AllowComment != nil {
		post.AllowComment = *input.AllowComment
	}
	if editor, err := uuid.Parse(c.GetString("user_id")); err == nil {
		post.EditorID = &editor
	}
	if input.Status == "published" {
		post.Status = "published"
		now := time.Now()
		post.PublishedAt = &now
	}
	if input.ScheduledAt != "" {
		stamp, err := parsePostTimestamp(input.ScheduledAt)
		if err != nil || post.Status != "draft" {
			c.JSON(400, gin.H{"error": "定时发布时间无效"})
			return
		}
		post.ScheduledAt = &stamp
	}
	if input.CreatedAt != "" {
		stamp, err := parsePostTimestamp(input.CreatedAt)
		if err != nil {
			c.JSON(400, gin.H{"error": "创建时间无效"})
			return
		}
		post.CreatedAt = stamp
	}
	if input.Password != "" {
		hash, err := utils.HashPassword(input.Password)
		if err != nil {
			c.JSON(500, gin.H{"error": "文章密码保存失败"})
			return
		}
		post.PasswordHash = hash
		post.PasswordHint = input.PasswordHint
	}
	if err := h.repo.CreateWithAssociations(post, repository.PostAssociations{Tags: &tags, SeriesID: series, SetSeries: series != nil}); err != nil {
		postWriteError(c, err, "创建文章失败")
		return
	}
	saved, err := h.repo.GetByID(post.ID)
	if err != nil {
		postWriteError(c, err, "读取文章失败")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"post": saved})
}

func (h *PostHandler) Update(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "参数错误"})
		return
	}
	var input struct {
		Title        *string        `json:"title"`
		Slug         *string        `json:"slug"`
		Content      *string        `json:"content"`
		Excerpt      *string        `json:"excerpt"`
		CoverImage   *string        `json:"cover_image"`
		Status       *string        `json:"status" binding:"omitempty,oneof=draft published"`
		IsTop        *bool          `json:"is_top"`
		AllowComment *bool          `json:"allow_comment"`
		AuthorName   *string        `json:"author_name"`
		CategoryID   optionalString `json:"category_id"`
		TagIDs       *[]string      `json:"tag_ids"`
		ScheduledAt  optionalString `json:"scheduled_at"`
		SeriesID     optionalString `json:"series_id"`
		Password     *string        `json:"password"`
		PasswordHint *string        `json:"password_hint"`
		CreatedAt    *string        `json:"created_at"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": "参数错误"})
		return
	}
	if input.Password != nil && len(*input.Password) > 72 {
		c.JSON(400, gin.H{"error": "文章密码不能超过 72 字节"})
		return
	}
	updates := map[string]interface{}{}
	if input.Title != nil {
		if strings.TrimSpace(*input.Title) == "" {
			c.JSON(400, gin.H{"error": "标题不能为空"})
			return
		}
		updates["title"] = *input.Title
	}
	if input.Slug != nil {
		if strings.TrimSpace(*input.Slug) == "" {
			c.JSON(400, gin.H{"error": "路径不能为空"})
			return
		}
		updates["slug"] = *input.Slug
	}
	for key, value := range map[string]*string{"content": input.Content, "excerpt": input.Excerpt, "cover_image": input.CoverImage, "author_name": input.AuthorName} {
		if value != nil {
			updates[key] = *value
		}
	}
	if input.Status != nil {
		for key, value := range repository.PostStatusUpdates(*input.Status, time.Now()) {
			updates[key] = value
		}
	}
	if input.ScheduledAt.Present {
		updates["scheduled_at"] = nil
		if input.ScheduledAt.Value != "" {
			stamp, err := parsePostTimestamp(input.ScheduledAt.Value)
			if err != nil {
				c.JSON(400, gin.H{"error": "定时发布时间无效"})
				return
			}
			updates["scheduled_at"] = stamp
		}
	}
	if input.IsTop != nil {
		updates["is_top"] = *input.IsTop
	}
	if input.AllowComment != nil {
		updates["allow_comment"] = *input.AllowComment
	}
	if input.CategoryID.Present {
		category, err := parseOptionalPostID(input.CategoryID.Value)
		if err != nil {
			c.JSON(400, gin.H{"error": "分类无效"})
			return
		}
		updates["category_id"] = category
	}
	associations := repository.PostAssociations{SetSeries: input.SeriesID.Present}
	if input.SeriesID.Present {
		series, err := parseOptionalPostID(input.SeriesID.Value)
		if err != nil {
			c.JSON(400, gin.H{"error": "系列无效"})
			return
		}
		associations.SeriesID = series
	}
	if input.TagIDs != nil {
		tags, err := parsePostIDs(*input.TagIDs)
		if err != nil {
			c.JSON(400, gin.H{"error": "标签无效"})
			return
		}
		associations.Tags = &tags
	}
	if input.Password != nil {
		if *input.Password == "" {
			updates["password_hash"] = ""
			updates["password_hint"] = ""
		} else {
			hash, err := utils.HashPassword(*input.Password)
			if err != nil {
				c.JSON(500, gin.H{"error": "文章密码保存失败"})
				return
			}
			updates["password_hash"] = hash
			if input.PasswordHint != nil {
				updates["password_hint"] = *input.PasswordHint
			}
		}
	} else if input.PasswordHint != nil {
		updates["password_hint"] = *input.PasswordHint
	}
	if editor, err := uuid.Parse(c.GetString("user_id")); err == nil {
		updates["editor_id"] = editor
	}
	if input.CreatedAt != nil {
		stamp, err := parsePostTimestamp(*input.CreatedAt)
		if err != nil {
			c.JSON(400, gin.H{"error": "创建时间无效"})
			return
		}
		updates["created_at"] = stamp
	}
	revision := input.Title != nil || input.Content != nil || input.Excerpt != nil
	if err := h.repo.UpdateWithAssociations(id, updates, associations, revision); err != nil {
		postWriteError(c, err, "更新文章失败")
		return
	}
	post, err := h.repo.GetByID(id)
	if err != nil {
		postWriteError(c, err, "读取文章失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"post": post})
}
