package handler

import (
	"archive/zip"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"tano_blog/backend/internal/utils"
)

var restoreSafeColumns = map[string][]string{
	"users":             {"id", "username", "email", "password_hash", "display_name", "avatar_url", "bio", "totp_secret", "totp_enabled", "reset_token", "token_version", "role", "must_change_password", "created_at", "updated_at"},
	"categories":        {"id", "name", "slug", "description", "sort_order", "created_at", "updated_at"},
	"tags":              {"id", "name", "slug", "sort_order", "created_at"},
	"media_tags":        {"id", "name", "created_at"},
	"site_configs":      {"id", "key", "value", "type", "created_at", "updated_at"},
	"posts":             {"id", "title", "slug", "content", "excerpt", "cover_image", "status", "is_top", "allow_comment", "author_name", "author_id", "editor_id", "category_id", "view_count", "published_at", "preview_token", "password_hash", "password_hint", "created_at", "updated_at"},
	"post_tags":         {"post_id", "tag_id"},
	"comments":          {"id", "post_id", "parent_id", "nickname", "email", "website", "content", "status", "ip_address", "user_agent", "country", "city", "fingerprint", "edited_count", "edited_at", "updated_at", "created_at"},
	"media":             {"id", "filename", "original_name", "mime_type", "size", "url", "thumbnail_url", "alt_text", "title", "artist", "album", "description", "uploaded_by", "created_at"},
	"media_tag_links":   {"media_id", "media_tag_id"},
	"passkeys":          {"id", "user_id", "credential_id", "public_key", "credential_data", "sign_count", "aaguid", "nickname", "created_at"},
	"post_revisions":    {"id", "post_id", "title", "content", "excerpt", "editor_id", "created_at"},
	"access_logs":       {"id", "path", "method", "ip_address", "user_agent", "status_code", "response_time", "referer", "query_params", "device_type", "browser", "os", "country", "city", "user_id", "session_id", "created_at"},
	"series":            {"id", "name", "slug", "description", "cover_image", "sort_order", "created_at", "updated_at"},
	"post_series":       {"series_id", "post_id", "sort_order"},
	"comment_reactions": {"id", "comment_id", "emoji", "ip_address", "created_at"},
	"comment_revisions": {"id", "comment_id", "content", "edited_at"},
	"post_reactions":    {"id", "post_id", "emoji", "ip_address", "created_at"},
	"friend_links":      {"id", "name", "url", "description", "avatar", "email", "status", "sort_order", "created_at", "updated_at"},
	"gallery_images":    {"id", "url", "title", "description", "width", "height", "sort_order", "created_at", "updated_at"},
	"nav_links":         {"id", "title", "url", "sort_order", "created_at", "updated_at"},
	"ip_bans":           {"id", "ip_address", "scope", "reason", "auto_ban", "expires_at", "created_by", "created_at"},
	"notifications":     {"id", "user_id", "type", "title", "content", "link", "is_read", "created_at"},
}

// safeColumnName ensures a column name contains only safe characters
var safeColumnRe = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

type BackupHandler struct {
	db        *gorm.DB
	uploadDir string
	backupDir string
}

func NewBackupHandler(db *gorm.DB, uploadDir, backupDir string) *BackupHandler {
	h := &BackupHandler{db: db, uploadDir: uploadDir, backupDir: backupDir}
	os.MkdirAll(backupDir, 0755)
	return h
}

// backupData is the serializable backup format for all tables
type backupData struct {
	Version   string                              `json:"version"`
	CreatedAt string                              `json:"created_at"`
	Data      map[string][]map[string]interface{} `json:"data"`
}

// backupTables ordered by dependency (parents first)
var backupTables = []string{
	"users", "categories", "tags", "media_tags", "series", "site_configs",
	"posts", "post_tags", "post_series", "comments", "comment_reactions", "comment_revisions",
	"post_reactions", "media", "media_tag_links",
	"passkeys", "post_revisions", "access_logs",
	"friend_links", "gallery_images", "nav_links", "ip_bans", "notifications",
}

// truncateOrder drops children first to avoid FK violations
var truncateOrder = []string{
	"gallery_images", "notifications", "ip_bans", "nav_links", "friend_links",
	"access_logs", "post_revisions", "passkeys", "media_tag_links", "media",
	"post_reactions", "comment_revisions", "comment_reactions", "comments",
	"post_series", "post_tags", "posts", "site_configs", "series", "media_tags", "tags", "categories", "users",
}

const (
	maxRestoreArchiveSize  = int64(500 * 1024 * 1024)
	maxRestoreExpandedSize = uint64(2 * 1024 * 1024 * 1024)
	maxRestoreEntrySize    = uint64(500 * 1024 * 1024)
	maxRestoreDataJSONSize = int64(256 * 1024 * 1024)
)

// generateBackup writes a backup directly to disk so uploaded media is never
// accumulated in process memory.
func (h *BackupHandler) generateBackup(path string) error {
	data := backupData{
		Version:   "1.1",
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		Data:      make(map[string][]map[string]interface{}),
	}

	for _, table := range backupTables {
		rows := make([]map[string]interface{}, 0)
		if err := h.db.Table(table).Find(&rows).Error; err != nil {
			return fmt.Errorf("导出 %s 失败: %v", table, err)
		}
		data.Data[table] = rows
	}

	out, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return fmt.Errorf("创建备份文件失败: %v", err)
	}
	complete := false
	defer func() {
		_ = out.Close()
		if !complete {
			_ = os.Remove(path)
		}
	}()

	zw := zip.NewWriter(out)
	prefix := fmt.Sprintf("backup-%s", time.Now().UTC().Format("2006-01-02"))

	jsonBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化失败: %v", err)
	}
	f, err := zw.Create(prefix + "/data.json")
	if err != nil {
		return fmt.Errorf("创建 zip 条目失败: %v", err)
	}
	if _, err := f.Write(jsonBytes); err != nil {
		return fmt.Errorf("写入 data.json 失败: %v", err)
	}

	// Add uploads/ files
	uploadDir := h.uploadDir
	if !filepath.IsAbs(uploadDir) {
		uploadDir, _ = filepath.Abs(uploadDir)
	}
	err = filepath.Walk(uploadDir, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(uploadDir, path)
		if err != nil {
			return err
		}
		f, err := zw.Create(prefix + "/uploads/" + rel)
		if err != nil {
			return err
		}
		src, err := os.Open(path)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(f, src)
		closeErr := src.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	})
	if err != nil && !os.IsNotExist(err) {
		_ = zw.Close()
		return fmt.Errorf("打包上传文件失败: %v", err)
	}

	if err := zw.Close(); err != nil {
		return fmt.Errorf("完成 ZIP 失败: %v", err)
	}
	if err := out.Close(); err != nil {
		return fmt.Errorf("保存 ZIP 失败: %v", err)
	}
	complete = true
	return nil
}

// restoreFromZip parses and restores data from a zip reader
func (h *BackupHandler) restoreFromZip(zr *zip.Reader) error {
	if err := validateRestoreArchive(zr); err != nil {
		return err
	}
	var input backupData
	dataFiles := 0
	for _, f := range zr.File {
		if filepath.Base(f.Name) != "data.json" {
			continue
		}
		dataFiles++
		if dataFiles > 1 {
			return fmt.Errorf("备份文件包含多个 data.json")
		}
		rc, err := f.Open()
		if err != nil {
			return fmt.Errorf("读取 data.json 失败: %v", err)
		}
		jsonBytes, err := io.ReadAll(io.LimitReader(rc, maxRestoreDataJSONSize+1))
		rc.Close()
		if err != nil || int64(len(jsonBytes)) > maxRestoreDataJSONSize {
			return fmt.Errorf("data.json 过大或读取失败")
		}
		if err := json.Unmarshal(jsonBytes, &input); err != nil {
			return fmt.Errorf("解析 data.json 失败: %v", err)
		}
	}
	if input.Version == "" {
		return fmt.Errorf("无效的备份文件")
	}

	// Validate all expected tables exist in backup data before truncating
	for _, table := range backupTables {
		if _, ok := input.Data[table]; !ok {
			return fmt.Errorf("备份文件缺少数据表: %s", table)
		}
	}

	tx := h.db.Begin()
	if tx.Error != nil {
		return fmt.Errorf("开始恢复事务失败: %v", tx.Error)
	}

	// Truncate all tables
	for _, t := range truncateOrder {
		if err := tx.Exec(fmt.Sprintf("TRUNCATE TABLE %s CASCADE", t)).Error; err != nil {
			tx.Rollback()
			return fmt.Errorf("清空表 %s 失败: %v", t, err)
		}
	}

	// Insert data in dependency order
	for _, table := range backupTables {
		rows, ok := input.Data[table]
		if !ok || len(rows) == 0 {
			continue
		}
		for _, row := range rows {
			// Version 1.0 did not export WebAuthn credential material. Those
			// records cannot be used, but must not prevent the rest from restoring.
			if table == "passkeys" && (row["credential_id"] == nil || row["public_key"] == nil) {
				continue
			}
			cols := make([]string, 0, len(row))
			vals := make([]interface{}, 0, len(row))
			for k, v := range row {
				if !safeColumnRe.MatchString(k) {
					continue // skip unsafe column names
				}
				// Skip columns not in the allowlist for this table
				if safeCols, ok := restoreSafeColumns[table]; ok {
					allowed := false
					for _, col := range safeCols {
						if col == k {
							allowed = true
							break
						}
					}
					if !allowed {
						continue
					}
				}
				cols = append(cols, k)
				vals = append(vals, normalizeRestoreValue(table, k, v))
			}
			placeholders := make([]string, len(cols))
			for i := range placeholders {
				placeholders[i] = "?"
			}
			if len(cols) == 0 {
				tx.Rollback()
				return fmt.Errorf("恢复 %s 失败: 记录不包含可恢复字段", table)
			}
			sql := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)", table,
				strings.Join(cols, ","), strings.Join(placeholders, ","))
			if err := tx.Exec(sql, vals...).Error; err != nil {
				tx.Rollback()
				return fmt.Errorf("恢复 %s 失败: %v", table, err)
			}
		}
	}

	// Restored bearer/reset tokens must never become valid again.
	if err := tx.Exec("UPDATE users SET token_version = token_version + 1, reset_token = ''").Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("使旧会话失效失败: %v", err)
	}

	if err := tx.Commit().Error; err != nil {
		return fmt.Errorf("提交事务失败: %v", err)
	}
	return nil
}

func validateRestoreArchive(zr *zip.Reader) error {
	var total uint64
	for _, f := range zr.File {
		if f.UncompressedSize64 > maxRestoreEntrySize {
			return fmt.Errorf("ZIP 条目过大: %s", f.Name)
		}
		if total > maxRestoreExpandedSize-f.UncompressedSize64 {
			return fmt.Errorf("ZIP 解压后总大小超过限制")
		}
		total += f.UncompressedSize64
	}
	return nil
}

func normalizeRestoreValue(table, column string, value interface{}) interface{} {
	if table == "passkeys" && column == "public_key" {
		if encoded, ok := value.(string); ok {
			if decoded, err := base64.StdEncoding.DecodeString(encoded); err == nil {
				return decoded
			}
		}
	}
	return value
}

// extractUploads extracts upload files from a zip reader
func (h *BackupHandler) extractUploads(zr *zip.Reader) []string {
	uploadDir := h.uploadDir
	if !filepath.IsAbs(uploadDir) {
		uploadDir, _ = filepath.Abs(uploadDir)
	}
	var fileErrors []string
	for _, f := range zr.File {
		parts := strings.SplitN(f.Name, "/uploads/", 2)
		if len(parts) != 2 || parts[1] == "" {
			continue
		}
		rel := parts[1]
		if f.Mode()&os.ModeSymlink != 0 {
			fileErrors = append(fileErrors, rel)
			continue
		}
		targetPath := filepath.Join(uploadDir, rel)
		// Security: prevent Zip Slip — ensure path stays within uploadDir
		if !strings.HasPrefix(targetPath, uploadDir+string(filepath.Separator)) {
			fileErrors = append(fileErrors, rel)
			continue
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(targetPath, 0755); err != nil {
				fileErrors = append(fileErrors, rel)
			}
			continue
		}
		os.MkdirAll(filepath.Dir(targetPath), 0755)

		rc, err := f.Open()
		if err != nil {
			fileErrors = append(fileErrors, rel)
			continue
		}
		out, err := os.Create(targetPath)
		if err != nil {
			rc.Close()
			fileErrors = append(fileErrors, rel)
			continue
		}
		if _, err := io.CopyN(out, rc, int64(f.UncompressedSize64)); err != nil {
			fileErrors = append(fileErrors, rel)
		}
		rc.Close()
		out.Close()
	}
	return fileErrors
}

// ===== Routes =====

// CreateBackup generates a backup and saves it to the backups directory
func (h *BackupHandler) CreateBackup(c *gin.Context) {
	filename := fmt.Sprintf("backup-%s.zip", time.Now().UTC().Format("2006-01-02T150405.000000000"))
	path := filepath.Join(h.backupDir, filename)
	err := h.generateBackup(path)
	if err != nil {
		utils.LogError("操作失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "备份创建成功", "filename": filename})
}

// ListBackups returns all backup files in the backups directory
func (h *BackupHandler) ListBackups(c *gin.Context) {
	entries, err := os.ReadDir(h.backupDir)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"items": []interface{}{}})
		return
	}

	var backups []map[string]interface{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "backup-") || !strings.HasSuffix(entry.Name(), ".zip") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		// Parse timestamps from both current and legacy backup filenames.
		createdAt := info.ModTime().UTC().Format(time.RFC3339)
		timestamp := strings.TrimSuffix(strings.TrimPrefix(entry.Name(), "backup-"), ".zip")
		for _, layout := range []string{"2006-01-02T150405.000000000", "2006-01-02T150405"} {
			if t, err := time.Parse(layout, timestamp); err == nil {
				createdAt = t.UTC().Format(time.RFC3339Nano)
				break
			}
		}

		backups = append(backups, map[string]interface{}{
			"filename":   entry.Name(),
			"size":       info.Size(),
			"created_at": createdAt,
		})
	}

	// Sort by created_at descending
	sort.Slice(backups, func(i, j int) bool {
		return backups[i]["created_at"].(string) > backups[j]["created_at"].(string)
	})

	c.JSON(http.StatusOK, gin.H{"items": backups})
}

// DownloadBackup streams a saved backup file
func (h *BackupHandler) DownloadBackup(c *gin.Context) {
	filename := c.Param("filename")
	// Security: prevent path traversal
	if strings.Contains(filename, "/") || strings.Contains(filename, "..") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的文件名"})
		return
	}

	path := filepath.Join(h.backupDir, filename)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "备份文件不存在"})
		return
	}

	c.Header("Content-Type", "application/zip")
	c.FileAttachment(path, filename)
}

// DeleteBackup deletes a saved backup file
func (h *BackupHandler) DeleteBackup(c *gin.Context) {
	filename := c.Param("filename")
	if strings.Contains(filename, "/") || strings.Contains(filename, "..") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的文件名"})
		return
	}

	path := filepath.Join(h.backupDir, filename)
	if err := os.Remove(path); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "备份文件不存在"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

// Tables to skip when clearing all data (user accounts, settings)
var clearSkipTables = map[string]bool{
	"users": true, "site_configs": true,
}

// ClearAllData truncates content tables and removes uploaded files.
// Users and site configs are preserved.
func (h *BackupHandler) ClearAllData(c *gin.Context) {
	var input struct {
		Confirm string `json:"confirm" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.Confirm != "CLEAR_ALL" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "确认信息不正确"})
		return
	}

	tx := h.db.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法开始清空操作"})
		return
	}
	for _, t := range truncateOrder {
		if clearSkipTables[t] {
			continue
		}
		if err := tx.Exec(fmt.Sprintf("TRUNCATE TABLE %s CASCADE", t)).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("清空表 %s 失败: %v", t, err)})
			return
		}
	}
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "提交清空操作失败"})
		return
	}

	// Also clear uploaded files
	uploadDir := h.uploadDir
	if !filepath.IsAbs(uploadDir) {
		absDir, _ := filepath.Abs(uploadDir)
		uploadDir = absDir
	}
	if entries, err := os.ReadDir(uploadDir); err == nil {
		for _, entry := range entries {
			os.RemoveAll(filepath.Join(uploadDir, entry.Name()))
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "全站数据已清空"})
}

// RestoreUpload handles uploaded zip file restore
func (h *BackupHandler) RestoreUpload(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxRestoreArchiveSize+(1<<20))
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请上传备份文件"})
		return
	}
	defer file.Close()

	if header.Size > maxRestoreArchiveSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "备份文件过大（最大 500MB）"})
		return
	}

	tmp, err := os.CreateTemp(h.backupDir, "restore-upload-*.zip")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法创建临时文件"})
		return
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	defer tmp.Close()
	size, err := io.Copy(tmp, io.LimitReader(file, maxRestoreArchiveSize+1))
	if err != nil || size > maxRestoreArchiveSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "备份文件过大或读取失败"})
		return
	}

	zr, err := zip.NewReader(tmp, size)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 ZIP 文件"})
		return
	}

	if err := h.restoreFromZip(zr); err != nil {
		utils.LogError("操作失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}

	fileErrors := h.extractUploads(zr)
	result := gin.H{"message": "恢复完成"}
	if len(fileErrors) > 0 {
		result["warning"] = fmt.Sprintf("%d 个文件恢复失败", len(fileErrors))
	}
	c.JSON(http.StatusOK, result)
}

// RestoreURL downloads a zip from URL and restores
func (h *BackupHandler) RestoreURL(c *gin.Context) {
	var input struct {
		URL string `json:"url" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入下载地址"})
		return
	}

	// Validate URL to prevent SSRF
	parsedURL, err := url.Parse(input.URL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的下载地址"})
		return
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持 http/https 协议"})
		return
	}
	if parsedURL.Hostname() == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "下载地址缺少主机名"})
		return
	}

	// Download with timeout and SSRF protection via custom transport
	transport := &http.Transport{
		DialContext: (&net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
	}
	transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		addrs, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
		if err != nil {
			return nil, err
		}
		for _, ip := range addrs {
			if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
				return nil, fmt.Errorf("拒绝连接非公网地址: %s", ip.String())
			}
		}
		if len(addrs) == 0 {
			return nil, fmt.Errorf("主机名没有可用地址")
		}
		// Dial the already-vetted address directly to prevent DNS rebinding
		// between validation and connection establishment.
		return (&net.Dialer{Timeout: 30 * time.Second}).DialContext(
			ctx, network, net.JoinHostPort(addrs[0].String(), port),
		)
	}
	client := &http.Client{
		Timeout:   10 * time.Minute,
		Transport: transport,
	}
	resp, err := client.Get(input.URL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "下载失败"})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "下载地址返回异常状态"})
		return
	}
	if resp.ContentLength > maxRestoreArchiveSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "备份文件过大（最大 500MB）"})
		return
	}

	tmp, err := os.CreateTemp(h.backupDir, "restore-url-*.zip")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法创建临时文件"})
		return
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	defer tmp.Close()
	size, err := io.Copy(tmp, io.LimitReader(resp.Body, maxRestoreArchiveSize+1))
	if err != nil || size > maxRestoreArchiveSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "下载文件过大或读取失败"})
		return
	}

	zr, err := zip.NewReader(tmp, size)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "下载的文件不是有效的 ZIP"})
		return
	}

	if err := h.restoreFromZip(zr); err != nil {
		utils.LogError("操作失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}

	fileErrors := h.extractUploads(zr)
	result := gin.H{"message": "恢复完成"}
	if len(fileErrors) > 0 {
		result["warning"] = fmt.Sprintf("%d 个文件恢复失败", len(fileErrors))
	}
	c.JSON(http.StatusOK, result)
}

// RestoreLocal restores from a local backup file
func (h *BackupHandler) RestoreLocal(c *gin.Context) {
	var input struct {
		Filename string `json:"filename" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请指定备份文件"})
		return
	}

	// Security: prevent path traversal
	if strings.Contains(input.Filename, "/") || strings.Contains(input.Filename, "..") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的文件名"})
		return
	}

	path := filepath.Join(h.backupDir, input.Filename)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "备份文件不存在"})
		return
	}

	file, err := os.Open(path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取备份文件失败"})
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.Size() > maxRestoreArchiveSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "备份文件过大或读取失败"})
		return
	}

	zr, err := zip.NewReader(file, info.Size())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无效的备份文件"})
		return
	}

	if err := h.restoreFromZip(zr); err != nil {
		utils.LogError("操作失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}

	fileErrors := h.extractUploads(zr)
	result := gin.H{"message": "恢复完成"}
	if len(fileErrors) > 0 {
		result["warning"] = fmt.Sprintf("%d 个文件恢复失败", len(fileErrors))
	}
	c.JSON(http.StatusOK, result)
}

// CleanupOldBackups removes backups older than 7 days
func (h *BackupHandler) CleanupOldBackups() {
	entries, err := os.ReadDir(h.backupDir)
	if err != nil {
		return
	}
	deadline := time.Now().Add(-7 * 24 * time.Hour)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "backup-") || !strings.HasSuffix(entry.Name(), ".zip") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(deadline) {
			os.Remove(filepath.Join(h.backupDir, entry.Name()))
		}
	}
}
