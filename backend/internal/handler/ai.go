package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/service"
)

type AIHandler struct {
	aiService *service.AIService
	db        *gorm.DB
}

func NewAIHandler(aiService *service.AIService, db *gorm.DB) *AIHandler {
	return &AIHandler{aiService: aiService, db: db}
}

// GenerateExcerpt generates an AI excerpt for a post.
// POST /api/v1/admin/posts/:id/generate-excerpt
func (h *AIHandler) GenerateExcerpt(c *gin.Context) {
	postID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var post model.Post
	if err := h.db.First(&post, "id = ?", postID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}

	if post.Content == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文章内容为空，无法生成摘要"})
		return
	}

	excerpt, err := h.aiService.GenerateExcerpt(post.Content)
	if err != nil {
		if err.Error() == "AI 功能未启用" || err.Error() == "API Key 未配置" {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"excerpt": excerpt})
}
