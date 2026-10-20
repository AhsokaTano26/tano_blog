package handler

import (
	"encoding/csv"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"tano_blog/backend/internal/entryanimation"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/service"
	"tano_blog/backend/internal/utils"
)

type SiteConfigHandler struct {
	repo                 *repository.SiteConfigRepo
	db                   *gorm.DB
	emailService         *service.EmailService
	jwtSecret            string
	syncKeyEncryptionKey string
}

func NewSiteConfigHandler(db *gorm.DB, emailService *service.EmailService, jwtSecret, syncKeyEncryptionKey string) *SiteConfigHandler {
	return &SiteConfigHandler{
		repo:                 repository.NewSiteConfigRepo(db),
		db:                   db,
		emailService:         emailService,
		jwtSecret:            jwtSecret,
		syncKeyEncryptionKey: syncKeyEncryptionKey,
	}
}

// GetPublic returns public site config values (no auth required)
func (h *SiteConfigHandler) GetPublic(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	publicKeys := []string{
		"site_title", "site_description", "site_url",
		"footer_text", "comment_enabled", "default_theme",
		"accent_color", "head_injection", "content_head_injection", "footer_injection",
		"profile_avatar", "profile_name", "profile_bio", "profile_contacts",
		"site_favicon", "music_password",
		"turnstile_enabled", "turnstile_sitekey", "turnstile_modules",
	}
	if strings.HasSuffix(c.Request.URL.Path, "/about") {
		publicKeys = append(publicKeys, "about_content")
	}

	configs, err := h.repo.GetByKeys(publicKeys)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取配置失败"})
		return
	}

	result := make(map[string]interface{})
	result["music_password_protected"] = false
	for _, cfg := range configs {
		if cfg.Key == "music_password" {
			result["music_password_protected"] = cfg.Value != ""
			continue
		}
		result[cfg.Key] = cfg.Value
	}

	c.JSON(http.StatusOK, gin.H{"config": result})
}

// Music configuration depends on a resource cookie and must never enter a
// shared public configuration cache.
func (h *SiteConfigHandler) GetMusic(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	c.Header("Cache-Control", "private, no-store")
	c.Header("Vary", "Cookie")
	configs, err := h.repo.GetByKeys([]string{"music_password", "music_playlist", "music_page_config"})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取配置失败"})
		return
	}
	values := make(map[string]string)
	var musicCredential string
	for _, cfg := range configs {
		values[cfg.Key] = cfg.Value
		if cfg.Key == "music_password" {
			musicCredential = utils.ResourceCredentialRevision(cfg.Value, cfg.UpdatedAt)
		}
	}
	protected := values["music_password"] != ""
	result := gin.H{"music_password_protected": protected}
	cookie, _ := c.Cookie("music_access")
	if !protected || utils.VerifyBoundResourceToken(cookie, utils.ResourceMusic, "library", musicCredential, h.jwtSecret) {
		result["music_playlist"] = values["music_playlist"]
		result["music_page_config"] = values["music_page_config"]
	}
	c.JSON(http.StatusOK, gin.H{"config": result})
}

func (h *SiteConfigHandler) Get(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	configs, err := h.repo.GetAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取配置失败"})
		return
	}

	result := make(map[string]interface{})
	for _, cfg := range configs {
		if cfg.Key == "sync_ssh_private_key_enc" || cfg.Key == entryanimation.ConfigKey {
			continue
		}
		result[cfg.Key] = cfg.Value
	}

	c.JSON(http.StatusOK, gin.H{"config": result})
}

func (h *SiteConfigHandler) Update(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	var input map[string]string
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	settings, err := h.repo.GetByKeys([]string{"sync_role", "sync_enabled"})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "无法确认服务器同步角色，暂时禁止写入"})
		return
	}
	values := make(map[string]string, len(settings))
	for _, setting := range settings {
		values[setting.Key] = setting.Value
	}
	if values["sync_role"] == "standby" && values["sync_enabled"] == "true" {
		for key := range input {
			if !strings.HasPrefix(key, "sync_") {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": "备服务器只允许修改同步配置，请在主服务器修改站点设置"})
				return
			}
		}
	}
	var encryptedPrivateKey string
	if privateKey, ok := input["sync_ssh_private_key"]; ok && strings.TrimSpace(privateKey) != "" {
		if !strings.Contains(privateKey, "-----BEGIN") || !strings.Contains(privateKey, "PRIVATE KEY-----") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "SSH 私钥格式无效"})
			return
		}
		ciphertext, err := utils.EncryptSyncSecret(h.syncKeyEncryptionKey, privateKey)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		encryptedPrivateKey = ciphertext
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
		"music_password": true,
		"ai_enabled":     true, "ai_api_url": true, "ai_api_key": true, "ai_model": true,
		"turnstile_enabled": true, "turnstile_sitekey": true, "turnstile_secret": true,
		"ip_ban_auto_enabled": true, "ip_ban_auto_threshold": true, "ip_ban_auto_window": true,
		"ip_ban_auto_scope": true, "ip_ban_auto_duration": true,
		"sync_enabled": true, "sync_role": true, "sync_schedule_mode": true,
		"sync_interval_minutes": true, "sync_weekdays": true, "sync_time_of_day": true,
		"sync_timezone": true, "sync_ssh_target": true, "sync_ssh_key_path": true, "sync_ssh_port": true,
		"sync_remote_backup_dir": true, "sync_remote_upload_dir": true,
		"sync_bandwidth_kbps": true,
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		repo := repository.NewSiteConfigRepo(tx)
		if encryptedPrivateKey != "" {
			if err := repo.Upsert("sync_ssh_private_key_enc", encryptedPrivateKey, "secret"); err != nil {
				return err
			}
		}
		if input["sync_ssh_private_key_clear"] == "true" {
			if err := repo.Delete("sync_ssh_private_key_enc"); err != nil {
				return err
			}
		}
		for key, value := range input {
			if !allowedKeys[key] {
				continue
			}
			if err := repo.Upsert(key, value, "string"); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		utils.LogWarn("failed to update config", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存配置失败"})
		return
	}

	if encryptedPrivateKey != "" {
		utils.LogInfo("sync SSH private key updated", "admin_id", c.GetString("user_id"))
	}
	if input["sync_ssh_private_key_clear"] == "true" {
		utils.LogInfo("sync SSH private key cleared", "admin_id", c.GetString("user_id"))
	}
	for key := range input {
		// Audit log for injection/sensitive keys
		if _, ok := map[string]struct{}{"head_injection": {}, "content_head_injection": {}, "footer_injection": {}}[key]; ok {
			adminID := c.GetString("user_id")
			utils.LogInfo("sensitive config updated",
				"key", key,
				"admin_id", adminID,
			)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "配置已更新"})
}

func (h *SiteConfigHandler) TestEmail(c *gin.Context) {
	h = h.withContext(c.Request.Context())
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
	h = h.withContext(c.Request.Context())
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
	cache *analyticsCache
	repo  *repository.AccessLogRepo
}

func NewAccessLogHandler(db *gorm.DB) *AccessLogHandler {
	return &AccessLogHandler{
		repo:  repository.NewAccessLogRepo(db),
		cache: &analyticsCache{entries: map[string]analyticsEntry{}},
	}
}

func (h *AccessLogHandler) List(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	page, pageSize := pagination(c, 20, 100)
	start, end, rangeErr := repository.AnalyticsRange(strings.Split(c.Query("start"), "T")[0], strings.Split(c.Query("end"), "T")[0], time.Now())
	if rangeErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "日期范围无效（最多366天）"})
		return
	}

	filters := map[string]string{
		"path":        c.Query("path"),
		"method":      c.Query("method"),
		"ip":          c.Query("ip"),
		"status_code": c.Query("status_code"),
		"start":       start.Format(time.RFC3339),
		"end":         end.Format(time.RFC3339),
		"cursor":      c.Query("cursor"),
	}

	logs, total, err := h.repo.List(page, pageSize, filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取日志失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items":       logs,
		"next_cursor": repository.EncodeLogCursor(logs, total, pageSize),
		"total":       total,
		"page":        page,
		"size":        pageSize,
	})
}

func (h *AccessLogHandler) Stats(c *gin.Context) {
	data, err := h.analytics(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "统计失败，请检查日期范围（最多366天）"})
		return
	}
	c.JSON(http.StatusOK, data.Stats)
}

func (h *AccessLogHandler) StatsByDevice(c *gin.Context) {
	data, err := h.analytics(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "统计失败，请检查日期范围（最多366天）"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": data.Device})
}

func (h *AccessLogHandler) StatsByBrowser(c *gin.Context) {
	data, err := h.analytics(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "统计失败，请检查日期范围（最多366天）"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": data.Browser})
}

func (h *AccessLogHandler) StatsByOS(c *gin.Context) {
	data, err := h.analytics(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "统计失败，请检查日期范围（最多366天）"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": data.OS})
}

func (h *AccessLogHandler) StatsByHour(c *gin.Context) {
	data, err := h.analytics(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "统计失败，请检查日期范围（最多366天）"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": data.Hour})
}

func (h *AccessLogHandler) StatsByCountry(c *gin.Context) {
	data, err := h.analytics(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "统计失败，请检查日期范围（最多366天）"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": data.Country})
}

func (h *AccessLogHandler) StatsByReferrer(c *gin.Context) {
	data, err := h.analytics(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "统计失败，请检查日期范围（最多366天）"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": data.Referrer})
}

func (h *AccessLogHandler) StatsByPath(c *gin.Context) {
	data, err := h.analytics(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "统计失败，请检查日期范围（最多366天）"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": data.Path})
}

func (h *AccessLogHandler) StatsByStatusCode(c *gin.Context) {
	data, err := h.analytics(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "统计失败，请检查日期范围（最多366天）"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": data.Status})
}

func (h *AccessLogHandler) StatsTimeRange(c *gin.Context) {
	data, err := h.analytics(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "统计失败，请检查日期范围（最多366天）"})
		return
	}
	c.JSON(http.StatusOK, data.Stats)
}

func (h *AccessLogHandler) Export(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	start, end, rangeErr := repository.AnalyticsRange(strings.Split(c.Query("start"), "T")[0], strings.Split(c.Query("end"), "T")[0], time.Now())
	if rangeErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "日期范围无效（最多366天）"})
		return
	}
	filters := map[string]string{
		"path":        c.Query("path"),
		"method":      c.Query("method"),
		"ip":          c.Query("ip"),
		"status_code": c.Query("status_code"),
		"start":       start.Format(time.RFC3339),
		"end":         end.Format(time.RFC3339),
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
	h = h.withContext(c.Request.Context())
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
	h = h.withContext(c.Request.Context())
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
	h.cache.Lock()
	h.cache.entries = map[string]analyticsEntry{}
	h.cache.Unlock()
	c.JSON(http.StatusOK, gin.H{"message": "已清空"})
}

func verifyTurnstile(db *gorm.DB, module, token, ip string) bool {
	configRepo := repository.NewSiteConfigRepo(db)
	enabled, _ := configRepo.Get("turnstile_enabled")
	if enabled != "true" {
		return true
	}

	modules, _ := configRepo.Get("turnstile_modules")
	if modules != "" {
		found := false
		for _, m := range strings.Split(modules, ",") {
			if strings.TrimSpace(m) == module {
				found = true
				break
			}
		}
		if !found {
			return true
		}
	} else if module != "comment" {
		return true
	}

	secret, err := configRepo.Get("turnstile_secret")
	if err != nil || secret == "" {
		return true
	}

	values := url.Values{"secret": {secret}, "response": {token}, "remoteip": {ip}}
	req, err := http.NewRequestWithContext(db.Statement.Context, http.MethodPost, "https://challenges.cloudflare.com/turnstile/v0/siteverify", strings.NewReader(values.Encode()))
	if err != nil {
		return false
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var result struct {
		Success bool `json:"success"`
	}
	if err := json.Unmarshal(body, &result); err != nil || !result.Success {
		return false
	}
	return true
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
	return val
}
