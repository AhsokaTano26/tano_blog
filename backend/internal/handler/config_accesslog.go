package handler

import (
	"encoding/csv"
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/service"
	"tano_blog/backend/internal/utils"
)

type SiteConfigHandler struct {
	repo         *repository.SiteConfigRepo
	db           *gorm.DB
	emailService *service.EmailService
}

func NewSiteConfigHandler(db *gorm.DB, emailService *service.EmailService) *SiteConfigHandler {
	return &SiteConfigHandler{
		repo:         repository.NewSiteConfigRepo(db),
		db:           db,
		emailService: emailService,
	}
}

// GetPublic returns public site config values (no auth required)
func (h *SiteConfigHandler) GetPublic(c *gin.Context) {
	publicKeys := []string{
		"site_title", "site_description", "site_url",
		"footer_text", "comment_enabled", "default_theme",
		"accent_color", "head_injection", "content_head_injection", "footer_injection",
		"profile_avatar", "profile_name", "profile_bio", "profile_contacts",
		"site_favicon", "about_content", "music_playlist", "music_page_config",
		"turnstile_enabled", "turnstile_sitekey",
	}

	configs, err := h.repo.GetByKeys(publicKeys)
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

	allowedKeys := map[string]bool{
		"site_title": true, "site_description": true, "site_url": true,
		"footer_text": true, "comment_enabled": true, "default_theme": true,
		"accent_color": true, "posts_per_page": true, "excerpt_length": true,
		"head_injection": true, "content_head_injection": true, "footer_injection": true,
		"email_enabled": true, "email_provider": true, "email_from": true,
		"email_zeabur_api_key": true, "email_zeabur_api_url": true,
		"email_smtp_host": true, "email_smtp_port": true,
		"email_smtp_username": true, "email_smtp_password": true,
		"profile_avatar": true, "profile_name": true, "profile_bio": true, "profile_contacts": true,
		"site_favicon": true, "about_content": true, "music_playlist": true, "music_page_config": true,
		"ai_enabled": true, "ai_api_url": true, "ai_api_key": true, "ai_model": true,
		"turnstile_enabled": true, "turnstile_sitekey": true, "turnstile_secret": true,
	}

	for key, value := range input {
		if !allowedKeys[key] {
			continue
		}

		// Audit log for injection/sensitive keys
		if _, ok := map[string]struct{}{"head_injection": {}, "content_head_injection": {}, "footer_injection": {}}[key]; ok {
			adminID := c.GetString("user_id")
			utils.LogInfo("sensitive config updated",
				"key", key,
				"admin_id", adminID,
			)
		}

		if err := h.repo.Upsert(key, value, "string"); err != nil {
			utils.LogWarn("failed to update config", "key", key, "error", err)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "配置已更新"})
}

func (h *SiteConfigHandler) TestEmail(c *gin.Context) {
	if h.emailService == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "邮件服务未初始化"})
		return
	}

	// Find admin email from database
	var admin struct{ Email string }
	if err := h.db.Model(&model.User{}).Where("role = ?", "admin").First(&admin).Error; err != nil || admin.Email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "管理员邮箱未配置，请先完善个人信息"})
		return
	}

	if err := h.emailService.SendTestEmail(admin.Email); err != nil {
		utils.LogError("test email send failed", "to", admin.Email, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "发送测试邮件失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "测试邮件已发送至 " + admin.Email + "，请检查收件箱"})
}

// CheckVersion fetches the latest release tag from Docker Hub (used to avoid browser CORS).
// If version query param is provided, also returns the changelog (commits) for that version.
func (h *SiteConfigHandler) CheckVersion(c *gin.Context) {
	reqVersion := c.Query("version")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get("https://hub.docker.com/v2/repositories/tano26/tano_blog/tags?page_size=30")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"latest": ""})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.JSON(http.StatusOK, gin.H{"latest": ""})
		return
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"latest": ""})
		return
	}

	var data struct {
		Results []struct {
			Name string `json:"name"`
		} `json:"results"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		c.JSON(http.StatusOK, gin.H{"latest": ""})
		return
	}

	re := regexp.MustCompile(`^v\d+\.\d+\.\d+$`)
	var versions []string
	for _, t := range data.Results {
		if re.MatchString(t.Name) {
			versions = append(versions, t.Name)
		}
	}

	sort.Slice(versions, func(i, j int) bool {
		ai := parseSemver(versions[i])
		aj := parseSemver(versions[j])
		for k := 0; k < 3; k++ {
			if ai[k] != aj[k] {
				return ai[k] < aj[k]
			}
		}
		return false
	})

	latest := ""
	if len(versions) > 0 {
		latest = versions[len(versions)-1]
	}

	// Fetch changelog if requested
	var changelog []string
	if reqVersion != "" && re.MatchString(reqVersion) {
		for i, v := range versions {
			if v == reqVersion {
				prevVersion := ""
				if i > 0 {
					prevVersion = versions[i-1]
				}
				if prevVersion != "" {
					githubURL := "https://api.github.com/repos/AhsokaTano26/tano_blog/compare/" + prevVersion + "..." + reqVersion
					ghResp, ghErr := client.Get(githubURL)
					if ghErr == nil {
						defer ghResp.Body.Close()
						if ghResp.StatusCode == http.StatusOK {
							var ghData struct {
								Commits []struct {
									Commit struct {
										Message string `json:"message"`
									} `json:"commit"`
								} `json:"commits"`
							}
							if body, err := io.ReadAll(ghResp.Body); err == nil {
								json.Unmarshal(body, &ghData)
								for _, c := range ghData.Commits {
									msg := strings.SplitN(c.Commit.Message, "\n", 2)[0]
									changelog = append(changelog, msg)
								}
							}
						}
					}
				}
				break
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"latest":    latest,
		"changelog": changelog,
	})
}

func parseSemver(v string) []int {
	parts := strings.Split(strings.TrimPrefix(v, "v"), ".")
	res := make([]int, 3)
	for i, p := range parts {
		n, _ := strconv.Atoi(p)
		if i < 3 {
			res[i] = n
		}
	}
	return res
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

func (h *AccessLogHandler) StatsByDevice(c *gin.Context) {
	data, err := h.repo.StatsByDevice()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取设备统计失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": data})
}

func (h *AccessLogHandler) StatsByBrowser(c *gin.Context) {
	data, err := h.repo.StatsByBrowser()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取浏览器统计失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": data})
}

func (h *AccessLogHandler) StatsByOS(c *gin.Context) {
	data, err := h.repo.StatsByOS()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取操作系统统计失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": data})
}

func (h *AccessLogHandler) StatsByHour(c *gin.Context) {
	data, err := h.repo.StatsByHour()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取时段统计失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": data})
}

func (h *AccessLogHandler) StatsByCountry(c *gin.Context) {
	data, err := h.repo.StatsByCountry()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取统计失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": data})
}

func (h *AccessLogHandler) StatsByReferrer(c *gin.Context) {
	data, err := h.repo.StatsByReferrer()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取统计失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": data})
}

func (h *AccessLogHandler) StatsByPath(c *gin.Context) {
	data, err := h.repo.StatsByPath()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取统计失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": data})
}

func (h *AccessLogHandler) StatsByStatusCode(c *gin.Context) {
	data, err := h.repo.StatsByStatusCode()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取统计失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": data})
}

func (h *AccessLogHandler) StatsTimeRange(c *gin.Context) {
	start := c.Query("start")
	end := c.Query("end")
	data, err := h.repo.StatsTimeRange(start, end)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取统计失败"})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AccessLogHandler) Export(c *gin.Context) {
	filters := map[string]string{
		"path":        c.Query("path"),
		"method":      c.Query("method"),
		"ip":          c.Query("ip"),
		"status_code": c.Query("status_code"),
		"start":       c.Query("start"),
		"end":         c.Query("end"),
	}

	logs, _, err := h.repo.List(1, 10000, filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "导出失败"})
		return
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=access_logs.csv")
	c.Writer.Write([]byte{0xEF, 0xBB, 0xBF}) // UTF-8 BOM

	w := csv.NewWriter(c.Writer)
	w.Write([]string{"时间", "IP", "方法", "路径", "查询参数", "状态码", "耗时(ms)", "Referer", "国家", "城市", "设备", "浏览器", "操作系统", "UserAgent"})

	for _, log := range logs {
		w.Write([]string{
			log.CreatedAt.Format("2006-01-02 15:04:05"),
			log.IPAddress,
			log.Method,
			log.Path,
			log.QueryParams,
			strconv.Itoa(log.StatusCode),
			strconv.Itoa(log.ResponseTime),
			log.Referer,
			log.Country,
			log.City,
			log.DeviceType,
			log.Browser,
			log.OS,
			log.UserAgent,
		})
	}
	w.Flush()
}

func (h *AccessLogHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.repo.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

func (h *AccessLogHandler) Clear(c *gin.Context) {
	var input struct {
		Confirm string `json:"confirm"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.Confirm != "CLEAR_ALL" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请确认操作"})
		return
	}
	if err := h.repo.Clear(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "清空失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已清空"})
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
