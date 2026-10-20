package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tano_blog/backend/internal/entryanimation"
	"tano_blog/backend/internal/model"
)

type EntryAnimationHandler struct{ db *gorm.DB }

var errInvalidEntrySettings = errors.New("invalid stored entry animation settings")

func NewEntryAnimationHandler(db *gorm.DB) *EntryAnimationHandler {
	return &EntryAnimationHandler{db: db}
}

// Install before authentication so denied requests are also never cached.
func PrivateEntryAnimationCache(c *gin.Context) {
	if strings.HasPrefix(c.Request.URL.Path, "/api/v1/admin/entry-animation") {
		c.Header("Cache-Control", "private, no-store")
		c.Writer.Header().Add("Vary", "Cookie, Authorization")
		c.Header("X-Content-Type-Options", "nosniff")
	}
	c.Next()
}

func (h *EntryAnimationHandler) Register(admin *gin.RouterGroup) {
	admin.GET("/entry-animation", h.Get)
	admin.PUT("/entry-animation", h.Update)
	admin.GET("/entry-animation/player", h.Player)
	admin.POST("/entry-animation/preview", h.Preview)
}

func (h *EntryAnimationHandler) load(c *gin.Context) (entryanimation.Config, string, error) {
	var rows []model.SiteConfig
	config := entryanimation.Config{Overrides: map[string]string{}}
	err := h.db.WithContext(c.Request.Context()).Where("key IN ?", []string{entryanimation.ConfigKey, "site_title"}).Find(&rows).Error
	if err != nil {
		return config, "", err
	}
	title, stored := "", ""
	for _, row := range rows {
		if row.Key == "site_title" {
			title = row.Value
		}
		if row.Key == entryanimation.ConfigKey {
			stored = row.Value
		}
	}
	// Validate restored/imported values too, before placing them in a player.
	if stored != "" && json.Unmarshal([]byte(stored), &config) != nil {
		return config, title, errInvalidEntrySettings
	}
	if config.Validate() != nil {
		return config, title, errInvalidEntrySettings
	}
	return config, title, nil
}

func (h *EntryAnimationHandler) title(c *gin.Context) (string, error) {
	var row model.SiteConfig
	err := h.db.WithContext(c.Request.Context()).Where("key = ?", "site_title").Limit(1).Find(&row).Error
	return row.Value, err
}

func (h *EntryAnimationHandler) settings(c *gin.Context, config entryanimation.Config, title string, warning ...string) {
	result := gin.H{"overrides": config.Overrides, "icon_data_url": config.IconDataURL, "fields": entryanimation.Fields(title), "site_title": title}
	if len(warning) > 0 {
		result["warning"] = warning[0]
	}
	c.JSON(http.StatusOK, result)
}

func (h *EntryAnimationHandler) Get(c *gin.Context) {
	config, title, err := h.load(c)
	if errors.Is(err, errInvalidEntrySettings) {
		h.settings(c, entryanimation.Config{Overrides: map[string]string{}}, title, "已保存的动画设置无效，已加载默认草稿。请重新修改或保存默认设置以修复。")
		return
	}
	if err != nil {
		c.JSON(500, gin.H{"error": "读取动画设置失败"})
		return
	}
	h.settings(c, config, title)
}

func decodeEntryConfig(c *gin.Context) (entryanimation.Config, bool) {
	var input entryanimation.Config
	// Bounds text, JSON overhead and the base64 icon before allocating.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 800*1024)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		c.JSON(400, gin.H{"error": "动画设置格式无效或超过大小限制"})
		return input, false
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		c.JSON(400, gin.H{"error": "动画设置格式无效"})
		return input, false
	}
	if err := input.Validate(); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return input, false
	}
	return input, true
}

func (h *EntryAnimationHandler) Update(c *gin.Context) {
	input, ok := decodeEntryConfig(c)
	if !ok {
		return
	}
	title, err := h.title(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "读取动画设置失败"})
		return
	}
	data, err := json.Marshal(input)
	if err == nil {
		err = h.db.WithContext(c.Request.Context()).Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "key"}},
			DoUpdates: clause.AssignmentColumns([]string{"value", "type", "updated_at"}),
		}).Create(&model.SiteConfig{Key: entryanimation.ConfigKey, Value: string(data), Type: "private"}).Error
	}
	if err != nil {
		c.JSON(500, gin.H{"error": "保存动画设置失败"})
		return
	}
	h.settings(c, input, title)
}

func (h *EntryAnimationHandler) player(c *gin.Context, config entryanimation.Config, title string) {
	var user model.User
	if err := h.db.WithContext(c.Request.Context()).Select("username", "display_name").First(&user, "id = ?", c.GetString("user_id")).Error; err != nil {
		c.JSON(500, gin.H{"error": "读取用户资料失败"})
		return
	}
	name := user.DisplayName
	if name == "" {
		name = user.Username
	}
	c.JSON(200, gin.H{"html": entryanimation.Document(config, title, name, user.Username), "duration_ms": entryanimation.DurationMS})
}

func (h *EntryAnimationHandler) Player(c *gin.Context) {
	config, title, err := h.load(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "读取动画失败"})
		return
	}
	h.player(c, config, title)
}

func (h *EntryAnimationHandler) Preview(c *gin.Context) {
	input, ok := decodeEntryConfig(c)
	if !ok {
		return
	}
	title, err := h.title(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "读取动画设置失败"})
		return
	}
	h.player(c, input, title)
}
