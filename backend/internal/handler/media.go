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
		".webp": true, ".ico": true, ".bmp": true,
		".pdf": true, ".doc": true, ".docx": true,
		".mp3": true, ".mp4": true, ".webm": true, ".ogg": true,
		".zip": true, ".tar": true, ".gz": true,
		".txt": true, ".md": true, ".json": true, ".xml": true,
	}
	if !allowedExts[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的文件类型"})
		return
	}

	filename := uuid.New().String() + ext
	uploadDir := h.cfg.Dir
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建上传目录失败"})
		return
	}

	filePath := filepath.Join(uploadDir, filename)
	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件失败"})
		return
	}

	// Detect MIME type from file content
	f, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件失败"})
		return
	}
	buf := make([]byte, 512)
	n, _ := f.Read(buf)
	f.Close()
	mimeType := http.DetectContentType(buf[:n])

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

	// Associate tags if provided
	if tagIDsStr := c.PostForm("tag_ids"); tagIDsStr != "" {
		var tagIDs []uuid.UUID
		for _, s := range strings.Split(tagIDsStr, ",") {
			if id, err := uuid.Parse(strings.TrimSpace(s)); err == nil {
				tagIDs = append(tagIDs, id)
			}
		}
		if len(tagIDs) > 0 {
			h.repo.UpdateTags(media.ID, tagIDs)
		}
		media, _ = h.repo.GetByID(media.ID)
	}

	c.JSON(http.StatusCreated, gin.H{"media": media})
}

func (h *MediaHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	tagID := c.Query("tag")
	search := c.Query("search")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	media, total, err := h.repo.List(page, pageSize, tagID, search)
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

	if err := os.Remove(filepath.Join(h.cfg.Dir, m.Filename)); err != nil && !os.IsNotExist(err) {
		// Log but continue with deleting the record
	}
	if err := h.repo.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除记录失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

func (h *MediaHandler) UpdateMediaTags(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var req struct {
		TagIDs []string `json:"tag_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var tagIDs []uuid.UUID
	for _, s := range req.TagIDs {
		if id, err := uuid.Parse(s); err == nil {
			tagIDs = append(tagIDs, id)
		}
	}

	if err := h.repo.UpdateTags(id, tagIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新标签失败"})
		return
	}

	media, _ := h.repo.GetByID(id)
	c.JSON(http.StatusOK, gin.H{"media": media})
}

func (h *MediaHandler) ListTags(c *gin.Context) {
	tags, err := h.repo.ListTags()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取标签列表失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": tags})
}

func (h *MediaHandler) CreateTag(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入标签名称"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "标签名称不能为空"})
		return
	}
	if len(name) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "标签名称不能超过100个字符"})
		return
	}

	tag, err := h.repo.CreateTag(name)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "标签已存在"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"tag": tag})
}

func (h *MediaHandler) DeleteTag(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if err := h.repo.DeleteTag(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除标签失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}
