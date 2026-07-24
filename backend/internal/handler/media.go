package handler

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/dhowden/tag"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/utils"
)

type MediaHandler struct {
	repo        *repository.MediaRepo
	galleryRepo *repository.GalleryRepo
	cfg         *config.UploadConfig
}

func NewMediaHandler(repo *repository.MediaRepo, galleryRepo *repository.GalleryRepo, cfg *config.UploadConfig) *MediaHandler {
	return &MediaHandler{repo: repo, galleryRepo: galleryRepo, cfg: cfg}
}

func (h *MediaHandler) Upload(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择文件"})
		return
	}

	// Determine type-specific size limit before validation
	ext := strings.ToLower(filepath.Ext(file.Filename))
	imageExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true, ".ico": true, ".bmp": true, ".svg": true}
	audioExts := map[string]bool{".mp3": true, ".wav": true, ".flac": true, ".aac": true, ".m4a": true, ".ogg": true}
	videoExts := map[string]bool{".mp4": true, ".webm": true, ".mov": true, ".avi": true, ".mkv": true}

	var maxBytes int64
	var limitName string
	switch {
	case imageExts[ext]:
		maxBytes = h.cfg.MaxImageMB * 1024 * 1024
		limitName = fmt.Sprintf("%dMB", h.cfg.MaxImageMB)
	case audioExts[ext]:
		maxBytes = h.cfg.MaxAudioMB * 1024 * 1024
		limitName = fmt.Sprintf("%dMB", h.cfg.MaxAudioMB)
	case videoExts[ext]:
		maxBytes = h.cfg.MaxVideoMB * 1024 * 1024
		limitName = fmt.Sprintf("%dMB", h.cfg.MaxVideoMB)
	default:
		maxBytes = h.cfg.MaxImageMB * 1024 * 1024
		limitName = fmt.Sprintf("%dMB", h.cfg.MaxImageMB)
	}
	if file.Size > maxBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("文件大小超过限制（最大%s）", limitName)})
		return
	}

	allowedExts := map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true, ".gif": true,
		".webp": true, ".ico": true, ".bmp": true, ".svg": true,
		".pdf": true, ".doc": true, ".docx": true,
		".mp3": true, ".wav": true, ".flac": true, ".aac": true, ".m4a": true, ".ogg": true,
		".mp4": true, ".webm": true, ".mov": true, ".avi": true, ".mkv": true,
		".zip": true, ".tar": true, ".gz": true,
		".txt": true, ".md": true, ".json": true, ".xml": true,
	}
	if !allowedExts[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的文件类型: " + ext})
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
	keepFile := false
	defer func() {
		if !keepFile {
			_ = os.Remove(filePath)
		}
	}()

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

	// Verify detected MIME matches extension category
	imageMimes := []string{"image/"}
	audioMimes := []string{"audio/"}
	videoMimes := []string{"video/"}
	switch {
	case imageExts[ext] && !hasAnyPrefix(mimeType, imageMimes...):
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件内容与扩展名不匹配，请检查文件"})
		return
	case audioExts[ext] && !hasAnyPrefix(mimeType, audioMimes...):
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件内容与扩展名不匹配，请检查文件"})
		return
	case videoExts[ext] && !hasAnyPrefix(mimeType, videoMimes...):
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件内容与扩展名不匹配，请检查文件"})
		return
	}

	// Extract embedded album art and metadata from audio files
	var thumbnailURL string
	var audioTitle, audioArtist, audioAlbum string
	if strings.HasPrefix(mimeType, "audio/") {
		thumbnailURL, _ = extractAudioCover(filePath, uploadDir, filename)
		audioTitle, audioArtist, audioAlbum = extractAudioMetadata(filePath)
	}

	userID, _ := uuid.Parse(c.GetString("user_id"))
	media := &model.Media{
		Filename:     filename,
		OriginalName: file.Filename,
		MimeType:     mimeType,
		Size:         file.Size,
		URL:          "/uploads/" + filename,
		ThumbnailURL: thumbnailURL,
		Title:        audioTitle,
		Artist:       audioArtist,
		Album:        audioAlbum,
		UploadedBy:   userID,
	}

	if err := h.repo.Create(media); err != nil {
		if thumbnailURL != "" {
			_ = os.Remove(filepath.Join(uploadDir, filepath.Base(thumbnailURL)))
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存记录失败"})
		return
	}
	keepFile = true

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

	// 图片上传时自动加入图片馆
	if strings.HasPrefix(mimeType, "image/") {
		existing, _ := h.galleryRepo.FindByURL(media.URL)
		if existing == nil {
			items, _ := h.galleryRepo.List()
			maxOrder := 0
			for _, item := range items {
				if item.SortOrder > maxOrder {
					maxOrder = item.SortOrder
				}
			}
			galleryImg := &model.GalleryImage{
				ID:        uuid.New(),
				URL:       media.URL,
				Title:     media.OriginalName,
				SortOrder: maxOrder + 1,
			}
			_ = h.galleryRepo.Create(galleryImg)
		}
	}

	c.JSON(http.StatusCreated, gin.H{"media": media})
}

func (h *MediaHandler) GetMediaInfo(c *gin.Context) {
	url := c.Query("url")
	if url == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 url 参数"})
		return
	}
	m, err := h.repo.GetByURL(url)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "没有找到该资源"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"media": m})
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

	// Remove source file
	if err := os.Remove(filepath.Join(h.cfg.Dir, m.Filename)); err != nil && !os.IsNotExist(err) {
		utils.LogWarn("failed to remove media file", "error", err)
	}
	// Remove thumbnail if present
	if m.ThumbnailURL != "" {
		if err := os.Remove(filepath.Join(h.cfg.Dir, filepath.Base(m.ThumbnailURL))); err != nil && !os.IsNotExist(err) {
			utils.LogWarn("failed to remove media thumbnail", "error", err)
		}
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

func (h *MediaHandler) BatchDelete(c *gin.Context) {
	var input struct {
		IDs []string `json:"ids"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || len(input.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	ids := make([]uuid.UUID, len(input.IDs))
	for i, id := range input.IDs {
		uid, err := uuid.Parse(id)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
			return
		}
		ids[i] = uid
	}

	// Fetch items to remove files before deleting from DB
	items, err := h.repo.GetByIDs(ids)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取文件信息失败"})
		return
	}
	for _, item := range items {
		if err := os.Remove(filepath.Join(h.cfg.Dir, item.Filename)); err != nil && !os.IsNotExist(err) {
			utils.LogWarn("failed to remove media file", "error", err)
		}
		if item.ThumbnailURL != "" {
			if err := os.Remove(filepath.Join(h.cfg.Dir, filepath.Base(item.ThumbnailURL))); err != nil && !os.IsNotExist(err) {
				utils.LogWarn("failed to remove media thumbnail", "error", err)
			}
		}
	}

	if err := h.repo.BatchDelete(ids); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

func (h *MediaHandler) BatchUpdateTags(c *gin.Context) {
	var input struct {
		IDs    []string `json:"ids"`
		TagIDs []string `json:"tag_ids"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || len(input.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	ids := make([]uuid.UUID, len(input.IDs))
	for i, id := range input.IDs {
		uid, err := uuid.Parse(id)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
			return
		}
		ids[i] = uid
	}

	tagIDs := make([]uuid.UUID, len(input.TagIDs))
	for i, t := range input.TagIDs {
		uid, err := uuid.Parse(t)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
			return
		}
		tagIDs[i] = uid
	}

	if err := h.repo.BatchUpdateTags(ids, tagIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}

// safeExtractAudioCover calls extractAudioCover with panic recovery.
func safeExtractAudioCover(filePath, uploadDir, filename string) (thumb string) {
	defer func() {
		if r := recover(); r != nil {
			utils.LogWarn("audio cover extraction panicked", "file", filename, "recover", r)
		}
	}()
	thumb, _ = extractAudioCover(filePath, uploadDir, filename)
	return
}

// extractAudioCover extracts embedded album art from an audio file and saves it as a thumbnail.
func extractAudioCover(filePath, uploadDir, filename string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	meta, err := tag.ReadFrom(f)
	if err != nil {
		return "", err
	}

	pic := meta.Picture()
	if pic == nil {
		return "", nil
	}

	thumbFilename := strings.TrimSuffix(filename, filepath.Ext(filename)) + "_thumb." + pic.Ext
	thumbPath := filepath.Join(uploadDir, thumbFilename)
	if err := os.WriteFile(thumbPath, pic.Data, 0644); err != nil {
		return "", err
	}

	return "/uploads/" + thumbFilename, nil
}

// extractAudioMetadata reads title, artist, album from audio file metadata.
// Returns empty strings on any error (caller handles gracefully).
func extractAudioMetadata(filePath string) (title, artist, album string) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", "", ""
	}
	defer f.Close()

	meta, err := tag.ReadFrom(f)
	if err != nil {
		return "", "", ""
	}
	return meta.Title(), meta.Artist(), meta.Album()
}

func (h *MediaHandler) UpdateMetadata(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var req struct {
		Title        string `json:"title"`
		Artist       string `json:"artist"`
		Album        string `json:"album"`
		Description  string `json:"description"`
		ThumbnailURL string `json:"thumbnail_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	updates := map[string]interface{}{
		"title":         req.Title,
		"artist":        req.Artist,
		"album":         req.Album,
		"description":   req.Description,
		"thumbnail_url": req.ThumbnailURL,
	}

	if err := h.repo.UpdateMetadata(id, updates); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新元信息失败"})
		return
	}

	media, _ := h.repo.GetByID(id)
	c.JSON(http.StatusOK, gin.H{"media": media})
}

// hasAnyPrefix checks if s has any of the given prefixes
func hasAnyPrefix(s string, prefixes ...string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}
