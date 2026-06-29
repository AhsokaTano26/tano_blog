package handler

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

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
	"users", "categories", "tags", "media_tags", "site_configs",
	"posts", "post_tags", "comments", "media", "media_tag_links",
	"passkeys", "post_revisions", "access_logs",
}

// truncateOrder drops children first to avoid FK violations
var truncateOrder = []string{
	"post_revisions", "media_tag_links", "post_tags", "comments",
	"media", "media_tags", "posts", "passkeys", "categories", "tags",
	"site_configs", "access_logs", "users",
}

// generateBackup builds the backup data and returns the zip bytes
func (h *BackupHandler) generateBackup() ([]byte, error) {
	data := backupData{
		Version:   "1.0",
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		Data:      make(map[string][]map[string]interface{}),
	}

	for _, table := range backupTables {
		rows := make([]map[string]interface{}, 0)
		if err := h.db.Table(table).Find(&rows).Error; err != nil {
			return nil, fmt.Errorf("导出 %s 失败: %v", table, err)
		}
		data.Data[table] = rows
	}

	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)
	prefix := fmt.Sprintf("backup-%s", time.Now().UTC().Format("2006-01-02"))

	jsonBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("序列化失败: %v", err)
	}
	f, err := zw.Create(prefix + "/data.json")
	if err != nil {
		return nil, fmt.Errorf("创建 zip 条目失败: %v", err)
	}
	f.Write(jsonBytes)

	// Add uploads/ files
	uploadDir := h.uploadDir
	if !filepath.IsAbs(uploadDir) {
		uploadDir, _ = filepath.Abs(uploadDir)
	}
	filepath.Walk(uploadDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(uploadDir, path)
		if err != nil {
			return nil
		}
		f, err := zw.Create(prefix + "/uploads/" + rel)
		if err != nil {
			return nil
		}
		src, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer src.Close()
		io.Copy(f, src)
		return nil
	})

	zw.Close()
	return buf.Bytes(), nil
}

// restoreFromZip parses and restores data from a zip reader
func (h *BackupHandler) restoreFromZip(zr *zip.Reader) error {
	var input backupData
	for _, f := range zr.File {
		if filepath.Base(f.Name) != "data.json" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return fmt.Errorf("读取 data.json 失败: %v", err)
		}
		jsonBytes, _ := io.ReadAll(rc)
		rc.Close()
		if err := json.Unmarshal(jsonBytes, &input); err != nil {
			return fmt.Errorf("解析 data.json 失败: %v", err)
		}
	}
	if input.Version == "" {
		return fmt.Errorf("无效的备份文件")
	}

	tx := h.db.Begin()

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
			cols := make([]string, 0, len(row))
			vals := make([]interface{}, 0, len(row))
			for k, v := range row {
				if !safeColumnRe.MatchString(k) {
					continue // skip unsafe column names
				}
				cols = append(cols, k)
				vals = append(vals, v)
			}
			placeholders := make([]string, len(cols))
			for i := range placeholders {
				placeholders[i] = "?"
			}
			sql := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)", table,
				strings.Join(cols, ","), strings.Join(placeholders, ","))
			if err := tx.Exec(sql, vals...).Error; err != nil {
				tx.Rollback()
				return fmt.Errorf("恢复 %s 失败: %v", table, err)
			}
		}
	}

	if err := tx.Commit().Error; err != nil {
		return fmt.Errorf("提交事务失败: %v", err)
	}
	return nil
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
		targetPath := filepath.Join(uploadDir, rel)
		// Security: prevent Zip Slip — ensure path stays within uploadDir
		if !strings.HasPrefix(targetPath, uploadDir+string(filepath.Separator)) {
			fileErrors = append(fileErrors, rel)
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
		io.Copy(out, rc)
		rc.Close()
		out.Close()
	}
	return fileErrors
}

// ===== Routes =====

// CreateBackup generates a backup and saves it to the backups directory
func (h *BackupHandler) CreateBackup(c *gin.Context) {
	zipData, err := h.generateBackup()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	filename := fmt.Sprintf("backup-%s.zip", time.Now().UTC().Format("2006-01-02T150405"))
	path := filepath.Join(h.backupDir, filename)
	if err := os.WriteFile(path, zipData, 0600); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存备份文件失败"})
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
		// Parse timestamp from filename: backup-2006-01-02T150405.zip
		createdAt := info.ModTime().UTC().Format(time.RFC3339)
		if t, err := time.Parse("2006-01-02T150405", strings.TrimSuffix(strings.TrimPrefix(entry.Name(), "backup-"), ".zip")); err == nil {
			createdAt = t.UTC().Format(time.RFC3339)
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

	zipData, err := os.ReadFile(path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取备份文件失败"})
		return
	}

	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Data(http.StatusOK, "application/zip", zipData)
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

// RestoreUpload handles uploaded zip file restore
func (h *BackupHandler) RestoreUpload(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请上传备份文件"})
		return
	}
	defer file.Close()

	if header.Size > 500*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "备份文件过大（最大 500MB）"})
		return
	}

	buf := new(bytes.Buffer)
	io.Copy(buf, file)

	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 ZIP 文件"})
		return
	}

	if err := h.restoreFromZip(zr); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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

	// Download with timeout
	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Get(input.URL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "下载失败"})
		return
	}
	defer resp.Body.Close()

	if resp.ContentLength > 500*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "备份文件过大（最大 500MB）"})
		return
	}

	buf := new(bytes.Buffer)
	io.Copy(buf, resp.Body)

	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "下载的文件不是有效的 ZIP"})
		return
	}

	if err := h.restoreFromZip(zr); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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

	zipData, err := os.ReadFile(path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取备份文件失败"})
		return
	}

	zr, err := zip.NewReader(bytes.NewReader(zipData), int64(len(zipData)))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无效的备份文件"})
		return
	}

	if err := h.restoreFromZip(zr); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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
