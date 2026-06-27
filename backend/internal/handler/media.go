package handler

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
)

type MediaHandler struct {
	repo *repository.MediaRepo
	cfg  *config.UploadConfig
}

func NewMediaHandler(repo *repository.MediaRepo, cfg *config.UploadConfig) *MediaHandler {
	return &MediaHandler{repo: repo, cfg: cfg}
}

func (h *MediaHandler) Upload(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择文件"})
		return
	}

	if file.Size > h.cfg.MaxMB*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件大小超过限制"})
		return
	}

	// Validate file type
	ext := strings.ToLower(filepath.Ext(file.Filename))
	allowedExts := map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true, ".gif": true,
		".webp": true, ".svg": true, ".ico": true, ".bmp": true,
		".pdf": true, ".doc": true, ".docx": true,
		".mp3": true, ".mp4": true, ".webm": true, ".ogg": true,
		".zip": true, ".tar": true, ".gz": true,
		".txt": true, ".md": true, ".json": true, ".xml": true,
		".css": true, ".js": true, ".wasm": true,
	}
	if !allowedExts[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的文件类型"})
		return
	}

	filename := uuid.New().String() + ext
	uploadDir := h.cfg.Dir
	os.MkdirAll(uploadDir, 0755)

	filePath := filepath.Join(uploadDir, filename)
	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件失败"})
		return
	}

	// Detect MIME type from file content
	f, err := file.Open()
	if err == nil {
		buf := make([]byte, 512)
		n, _ := f.Read(buf)
		f.Close()
		mimeType := http.DetectContentType(buf[:n])
		if mimeType == "application/octet-stream" {
			mimeType = file.Header.Get("Content-Type")
		}

		userID, _ := uuid.Parse(c.GetString("user_id"))
		media := &model.Media{
			Filename:     filename,
			OriginalName: file.Filename,
			MimeType:     mimeType,
			Size:         file.Size,
			URL:          "/uploads/" + filename,
			UploadedBy:   userID,
		}

		if err := h.repo.Create(media); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "保存记录失败"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"media": media})
	} else {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件失败"})
	}
}

func (h *MediaHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	media, total, err := h.repo.List(page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取媒体列表失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": media,
		"total": total,
		"page":  page,
		"size":  pageSize,
	})
}

func (h *MediaHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	m, err := h.repo.GetByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在"})
		return
	}

	os.Remove(filepath.Join(h.cfg.Dir, m.Filename))
	h.repo.Delete(id)
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}
