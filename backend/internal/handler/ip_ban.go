package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
)

var validScopes = map[string]bool{
	"post": true, "comment": true, "category": true,
	"tag": true, "series": true, "link": true,
	"gallery": true, "music": true, "search": true,
	"login": true, "site": true,
}

type IPBanHandler struct {
	repo       *repository.IPBanRepo
	configRepo *repository.SiteConfigRepo
}

func NewIPBanHandler(repo *repository.IPBanRepo, configRepo *repository.SiteConfigRepo) *IPBanHandler {
	return &IPBanHandler{repo: repo, configRepo: configRepo}
}

func (h *IPBanHandler) ListBans(c *gin.Context) {
	page := parseInt(c.DefaultQuery("page", "1"), 1)
	pageSize := parseInt(c.DefaultQuery("page_size", "20"), 20)

	items, total, err := h.repo.List(page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取封禁列表失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "size": pageSize})
}

func (h *IPBanHandler) CreateBan(c *gin.Context) {
	var input struct {
		IPAddress string `json:"ip_address"`
		Scope     string `json:"scope"`
		Reason    string `json:"reason"`
		ExpiresAt string `json:"expires_at"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求数据"})
		return
	}
	if input.IPAddress == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IP地址不能为空"})
		return
	}

	// Validate and normalize scope
	scopes := strings.Split(input.Scope, ",")
	validated := make([]string, 0, len(scopes))
	for _, s := range scopes {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if !validScopes[s] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的封禁范围: " + s})
			return
		}
		validated = append(validated, s)
	}
	if len(validated) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择至少一个封禁范围"})
		return
	}

	ban := &model.IPBan{
		IPAddress: input.IPAddress,
		Scope:     strings.Join(validated, ","),
		Reason:    input.Reason,
	}

	if input.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, input.ExpiresAt)
		if err == nil {
			ban.ExpiresAt = &t
		}
	}

	adminID := c.GetString("user_id")
	if uid, err := uuid.Parse(adminID); err == nil {
		ban.CreatedBy = &uid
	}

	if err := h.repo.Create(ban); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建封禁失败"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"item": ban})
}

func (h *IPBanHandler) DeleteBan(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的ID"})
		return
	}
	if err := h.repo.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除封禁失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已解封"})
}

func (h *IPBanHandler) GetBanConfig(c *gin.Context) {
	keys := []string{
		"ip_ban_auto_enabled", "ip_ban_auto_threshold",
		"ip_ban_auto_window", "ip_ban_auto_scope", "ip_ban_auto_duration",
	}
	result := make(map[string]string)
	for _, key := range keys {
		val, _ := h.configRepo.Get(key)
		result[key] = val
	}
	c.JSON(http.StatusOK, result)
}

func (h *IPBanHandler) UpdateBanConfig(c *gin.Context) {
	var input map[string]string
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求数据"})
		return
	}

	allowed := map[string]bool{
		"ip_ban_auto_enabled": true, "ip_ban_auto_threshold": true,
		"ip_ban_auto_window": true, "ip_ban_auto_scope": true, "ip_ban_auto_duration": true,
	}

	for key, value := range input {
		if !allowed[key] {
			continue
		}
		_ = h.configRepo.Upsert(key, value, "string")
	}
	c.JSON(http.StatusOK, gin.H{"message": "配置已更新"})
}
