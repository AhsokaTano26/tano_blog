package handler

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/dhowden/tag"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

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

const uploadMetadataLimit int64 = 64 << 10

type streamedMedia struct {
	Filename, StoredName, Path, Kind, TagIDs string
	Size                                     int64
}

type uploadContextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r uploadContextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}

func uploadLimitMB(configured, fallback int64) int64 {
	if configured <= 0 {
		return fallback
	}
	return min(configured, 2048)
}

func mediaUploadType(ext string, cfg *config.UploadConfig) (string, int64) {
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".ico", ".bmp", ".svg":
		return "image", uploadLimitMB(cfg.MaxImageMB, 50) << 20
	case ".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg":
		return "audio", uploadLimitMB(cfg.MaxAudioMB, 200) << 20
	case ".mp4", ".webm", ".mov", ".avi", ".mkv":
		return "video", uploadLimitMB(cfg.MaxVideoMB, 2048) << 20
	case ".pdf", ".doc", ".docx", ".zip", ".tar", ".gz", ".txt", ".md", ".json", ".xml":
		return "file", uploadLimitMB(cfg.MaxImageMB, 50) << 20
	default:
		return "", 0
	}
}

// Read parts in order. Never close/drain a rejected part: that would consume the
// very upload we are rejecting. Only one bounded disk copy is retained.
func streamMediaUpload(c *gin.Context, cfg *config.UploadConfig) (*streamedMedia, int, error) {
	maxMB := max(uploadLimitMB(cfg.MaxImageMB, 50), uploadLimitMB(cfg.MaxAudioMB, 200), uploadLimitMB(cfg.MaxVideoMB, 2048))
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, (maxMB<<20)+(1<<20))
	reader, err := c.Request.MultipartReader()
	if err != nil {
		return nil, http.StatusBadRequest, fmt.Errorf("请选择文件")
	}
	result := &streamedMedia{}
	keep := false
	defer func() {
		if !keep && result.Path != "" {
			_ = os.Remove(result.Path)
		}
	}()
	var fieldBytes, headerBytes int64
	seenTags := false
	for parts := 0; ; parts++ {
		if err := c.Request.Context().Err(); err != nil {
			return nil, http.StatusRequestTimeout, err
		}
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, http.StatusBadRequest, fmt.Errorf("上传表单不完整: %w", err)
		}
		if parts >= 32 {
			return nil, http.StatusBadRequest, fmt.Errorf("上传表单字段过多")
		}
		for key, values := range part.Header {
			headerBytes += int64(len(key))
			for _, value := range values {
				headerBytes += int64(len(value))
			}
		}
		if headerBytes > uploadMetadataLimit {
			return nil, http.StatusBadRequest, fmt.Errorf("上传表单头过大")
		}
		if part.FileName() == "" {
			value, err := io.ReadAll(io.LimitReader(uploadContextReader{c.Request.Context(), part}, uploadMetadataLimit-fieldBytes+1))
			fieldBytes += int64(len(value))
			if err != nil || fieldBytes > uploadMetadataLimit {
				return nil, http.StatusBadRequest, fmt.Errorf("上传表单字段过大或已中断")
			}
			if part.FormName() == "tag_ids" && !seenTags {
				result.TagIDs = string(value)
				seenTags = true
			}
			continue
		}
		if part.FormName() != "file" || result.Path != "" {
			return nil, http.StatusBadRequest, fmt.Errorf("每次只能上传一个文件")
		}
		ext := strings.ToLower(filepath.Ext(part.FileName()))
		kind, limit := mediaUploadType(ext, cfg)
		if kind == "" {
			return nil, http.StatusBadRequest, fmt.Errorf("不支持的文件类型: %s", ext)
		}
		if err := os.MkdirAll(cfg.Dir, 0755); err != nil {
			return nil, http.StatusInternalServerError, fmt.Errorf("创建上传目录失败")
		}
		file, err := os.CreateTemp(cfg.Dir, ".upload-*")
		if err != nil {
			return nil, http.StatusInternalServerError, fmt.Errorf("创建上传文件失败")
		}
		result.Path = file.Name()
		result.Filename, result.StoredName, result.Kind = part.FileName(), uuid.New().String()+ext, kind
		result.Size, err = io.Copy(file, io.LimitReader(uploadContextReader{c.Request.Context(), part}, limit+1))
		closeErr := file.Close()
		if err != nil {
			return nil, http.StatusBadRequest, fmt.Errorf("上传已中断: %w", err)
		}
		if result.Size > limit {
			return nil, http.StatusBadRequest, fmt.Errorf("文件大小超过限制（最大%dMB）", limit>>20)
		}
		if closeErr != nil {
			return nil, http.StatusInternalServerError, fmt.Errorf("保存文件失败")
		}
	}
	if result.Path == "" {
		return nil, http.StatusBadRequest, fmt.Errorf("请选择文件")
	}
	if err := c.Request.Context().Err(); err != nil {
		return nil, http.StatusRequestTimeout, err
	}
	keep = true
	return result, http.StatusOK, nil
}

func (h *MediaHandler) Upload(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	file, status, err := streamMediaUpload(c, h.cfg)
	if err != nil {
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	filename, uploadDir, filePath := file.StoredName, h.cfg.Dir, file.Path
	keepFile := false
	var thumbnailURL string
	defer func() {
		if !keepFile {
			_ = os.Remove(filePath)
			if thumbnailURL != "" {
				_ = os.Remove(filepath.Join(uploadDir, filepath.Base(thumbnailURL)))
			}
		}
	}()

	// Detect MIME type from file content
	f, err := os.Open(filePath)
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
	case file.Kind == "image" && !hasAnyPrefix(mimeType, imageMimes...):
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件内容与扩展名不匹配，请检查文件"})
		return
	case file.Kind == "audio" && !hasAnyPrefix(mimeType, audioMimes...):
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件内容与扩展名不匹配，请检查文件"})
		return
	case file.Kind == "video" && !hasAnyPrefix(mimeType, videoMimes...):
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件内容与扩展名不匹配，请检查文件"})
		return
	}

	if err := c.Request.Context().Err(); err != nil {
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "上传已取消"})
		return
	}
	if err := os.Chmod(filePath, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件失败"})
		return
	}
	finalPath := filepath.Join(uploadDir, filename)
	if err := os.Rename(filePath, finalPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件失败"})
		return
	}
	filePath = finalPath

	// Extract embedded album art and metadata from audio files
	var audioTitle, audioArtist, audioAlbum string
	if strings.HasPrefix(mimeType, "image/") {
		thumbnailURL, err = utils.GenerateImageThumbnail(filePath)
		if err != nil {
			utils.LogWarn("image thumbnail unavailable; keeping original", "file", filename, "error", err)
		}
	}
	if strings.HasPrefix(mimeType, "audio/") {
		thumbnailURL = safeExtractAudioCover(filePath, uploadDir, filename)
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
	if tagIDsStr := file.TagIDs; tagIDsStr != "" {
		var tagIDs []uuid.UUID
		for _, s := range strings.Split(tagIDsStr, ",") {
			if id, err := uuid.Parse(strings.TrimSpace(s)); err == nil {
				tagIDs = append(tagIDs, id)
			}
		}
		if len(tagIDs) > 0 {
			h.repo.UpdateTags(media.ID, tagIDs)
		}
		if tagged, err := h.repo.GetByID(media.ID); err == nil {
			media = tagged
		}
	}

	// 图片上传时自动加入图片馆
	if strings.HasPrefix(mimeType, "image/") {
		if h.galleryRepo != nil {
			galleryImg := &model.GalleryImage{
				ID:    uuid.New(),
				URL:   media.URL,
				Title: media.OriginalName,
			}
			_ = h.galleryRepo.Create(galleryImg)
		}
	}

	c.JSON(http.StatusCreated, gin.H{"media": media})
}

func (h *MediaHandler) GetMediaInfo(c *gin.Context) {
	h = h.withContext(c.Request.Context())
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
	h = h.withContext(c.Request.Context())
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

	media, total, err := h.repo.List(page, pageSize, tagID, search, c.Query("type"))
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

// BackfillImageThumbnails runs once in the background at startup. Keyset batches
// keep memory bounded and failed/unsupported files cannot stall later batches.
func (h *MediaHandler) BackfillImageThumbnails(ctx context.Context, guards ...func(context.Context) (func(), error)) error {
	after := uuid.Nil
	for {
		items, err := h.repo.MissingImageThumbnails(ctx, after)
		if err != nil || len(items) == 0 {
			return err
		}
		for _, item := range items {
			if err := ctx.Err(); err != nil {
				return err
			}
			after = item.ID
			if err := h.backfillThumbnail(ctx, item.ID, guards); err != nil {
				return err
			}
		}
	}
}

func (h *MediaHandler) backfillThumbnail(ctx context.Context, id uuid.UUID, guards []func(context.Context) (func(), error)) error {
	releases := make([]func(), 0, len(guards))
	defer func() {
		for i := len(releases) - 1; i >= 0; i-- {
			releases[i]()
		}
	}()
	for _, guard := range guards {
		release, err := guard(ctx)
		if err != nil {
			return err
		}
		if release != nil {
			releases = append(releases, release)
		}
	}
	// A restore can replace files and records while the outer scan is waiting for
	// a lease. Reload inside the lease before generating from that record's path.
	item, err := h.repo.WithContext(ctx).GetByID(id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if item.ThumbnailURL != "" || filepath.Base(item.Filename) != item.Filename {
		return nil
	}
	url, err := utils.GenerateImageThumbnail(filepath.Join(h.cfg.Dir, item.Filename))
	if err != nil {
		utils.LogWarn("could not backfill image thumbnail", "file", item.Filename, "error", err)
		return nil
	}
	updated, err := h.repo.SetThumbnailIfEmpty(ctx, item.ID, url)
	if err != nil || !updated {
		_ = os.Remove(filepath.Join(h.cfg.Dir, filepath.Base(url)))
	}
	return err
}

func (h *MediaHandler) Delete(c *gin.Context) {
	h = h.withContext(c.Request.Context())
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	_, err = h.repo.GetByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在"})
		return
	}

	if err := h.repo.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除记录失败"})
		return
	}
	h.CleanupDeletedFiles(c.Request.Context())
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

func (h *MediaHandler) UpdateMediaTags(c *gin.Context) {
	h = h.withContext(c.Request.Context())
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
	h = h.withContext(c.Request.Context())
	tags, err := h.repo.ListTags()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取标签列表失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": tags})
}

func (h *MediaHandler) CreateTag(c *gin.Context) {
	h = h.withContext(c.Request.Context())
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
	h = h.withContext(c.Request.Context())
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
	h = h.withContext(c.Request.Context())
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

	if err := h.repo.BatchDelete(ids); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}
	h.CleanupDeletedFiles(c.Request.Context())
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

func (h *MediaHandler) BatchUpdateTags(c *gin.Context) {
	h = h.withContext(c.Request.Context())
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
		_ = os.Remove(thumbPath)
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
	h = h.withContext(c.Request.Context())
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

// CleanupDeletedFiles retries removals queued in the media deletion transaction.
// A failed database deletion never reaches the filesystem.
func (h *MediaHandler) CleanupDeletedFiles(ctx context.Context) {
	h = h.withContext(ctx)
	jobs, err := h.repo.PendingFileCleanup(100)
	if err != nil {
		utils.LogWarn("failed to read media cleanup queue", "error", err)
		return
	}
	for _, job := range jobs {
		if ctx.Err() != nil {
			return
		}
		inUse, err := h.repo.FileCleanupInUse(job.Filename)
		if err != nil {
			utils.LogWarn("failed to check media cleanup references", "error", err)
			continue
		}
		if inUse {
			if err := h.repo.CompleteFileCleanup(job.ID); err != nil {
				utils.LogWarn("failed to complete shared media cleanup", "error", err)
			}
			continue
		}
		var removeErr error
		if job.Filename == "" || job.Filename == "." || job.Filename == ".." || filepath.Base(job.Filename) != job.Filename {
			removeErr = fmt.Errorf("invalid cleanup filename")
		} else {
			removeErr = os.Remove(filepath.Join(h.cfg.Dir, job.Filename))
		}
		if removeErr != nil && !os.IsNotExist(removeErr) {
			utils.LogWarn("media file cleanup pending", "id", job.ID, "filename", job.Filename, "error", removeErr)
			if err := h.repo.FailFileCleanup(job.ID, removeErr.Error()); err != nil {
				utils.LogWarn("failed to record media cleanup error", "error", err)
			}
			continue
		}
		if err := h.repo.CompleteFileCleanup(job.ID); err != nil {
			utils.LogWarn("failed to complete media cleanup", "error", err)
		}
	}
}
