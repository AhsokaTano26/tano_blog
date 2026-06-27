package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"tano_blog/backend/internal/repository"
)

type SiteConfigHandler struct {
	repo *repository.SiteConfigRepo
	db   *gorm.DB
}

func NewSiteConfigHandler(db *gorm.DB) *SiteConfigHandler {
	return &SiteConfigHandler{
		repo: repository.NewSiteConfigRepo(db),
		db:   db,
	}
}

func (h *SiteConfigHandler) Get(c *gin.Context) {
	configs, err := h.repo.GetAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取配置失败"})
		return
	}

	result := make(map[string]interface{})
	for _, cfg := range configs {
		result[cfg.Key] = cfg.Value
	}

	c.JSON(http.StatusOK, gin.H{"config": result})
}

func (h *SiteConfigHandler) Update(c *gin.Context) {
	var input map[string]string
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	for key, value := range input {
		h.repo.Upsert(key, value, "string")
	}

	c.JSON(http.StatusOK, gin.H{"message": "配置已更新"})
}

type AccessLogHandler struct {
	repo *repository.AccessLogRepo
}

func NewAccessLogHandler(db *gorm.DB) *AccessLogHandler {
	return &AccessLogHandler{
		repo: repository.NewAccessLogRepo(db),
	}
}

func (h *AccessLogHandler) List(c *gin.Context) {
	page := parseInt(c.Query("page"), 1)
	pageSize := parseInt(c.Query("page_size"), 20)

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	filters := map[string]string{
		"path":        c.Query("path"),
		"method":      c.Query("method"),
		"ip":          c.Query("ip"),
		"status_code": c.Query("status_code"),
		"start":       c.Query("start"),
		"end":         c.Query("end"),
	}

	logs, total, err := h.repo.List(page, pageSize, filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取日志失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": logs,
		"total": total,
		"page":  page,
		"size":  pageSize,
	})
}

func (h *AccessLogHandler) Stats(c *gin.Context) {
	stats, err := h.repo.Stats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取统计失败"})
		return
	}

	c.JSON(http.StatusOK, stats)
}

func parseInt(s string, defaultVal int) int {
	if s == "" {
		return defaultVal
	}
	var val int
	for _, r := range s {
		if r < '0' || r > '9' {
			return defaultVal
		}
		val = val*10 + int(r-'0')
	}
	if val == 0 {
		return defaultVal
	}
	return val
}
