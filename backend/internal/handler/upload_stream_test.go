package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/model"
)

type uploadZeros struct{}

func (uploadZeros) Read(p []byte) (int, error) { clear(p); return len(p), nil }

type countedUpload struct {
	reader io.Reader
	read   int64
	cancel context.CancelFunc
}

func (r *countedUpload) Read(p []byte) (int, error) {
	n, err := r.reader.Read(p)
	r.read += int64(n)
	if r.cancel != nil && r.read >= 64<<10 {
		r.cancel()
	}
	return n, err
}

func largeUpload(t *testing.T, filename string, size int64) (*http.Request, *countedUpload) {
	return uploadWithContentPrefix(t, filename, size, nil)
}

func uploadWithContentPrefix(t *testing.T, filename string, size int64, prefix []byte) (*http.Request, *countedUpload) {
	t.Helper()
	var framing bytes.Buffer
	w := multipart.NewWriter(&framing)
	if _, err := w.CreateFormFile("file", filename); err != nil {
		t.Fatal(err)
	}
	headerSize := framing.Len()
	w.Close()
	reader := &countedUpload{reader: io.MultiReader(bytes.NewReader(framing.Bytes()[:headerSize]), bytes.NewReader(prefix), io.LimitReader(uploadZeros{}, size-int64(len(prefix))), bytes.NewReader(framing.Bytes()[headerSize:]))}
	req := httptest.NewRequest(http.MethodPost, "/upload", reader)
	req.Header.Set("Content-Type", w.FormDataContentType())
	return req, reader
}

func TestUploadAcceptsLargeVideoWithoutMultipartSpill(t *testing.T) {
	h, _, userID := mediaTestHandler(t)
	spillDir := t.TempDir()
	t.Setenv("TMPDIR", spillDir)
	const size = 100 << 20
	// A MIME-valid header followed by streamed padding; no 100MiB in-memory fixture.
	req, _ := uploadWithContentPrefix(t, "large.mp4", size, []byte("\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"))
	r := gin.New()
	r.POST("/upload", func(c *gin.Context) { c.Set("user_id", userID.String()); h.Upload(c) })
	response := httptest.NewRecorder()
	r.ServeHTTP(response, req)
	if response.Code != http.StatusCreated {
		t.Fatalf("status %d: %s", response.Code, response.Body)
	}
	var result struct {
		Media model.Media `json:"media"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	stat, err := os.Stat(filepath.Join(h.cfg.Dir, result.Media.Filename))
	if err != nil || result.Media.Size != size || stat.Size() != size || result.Media.MimeType != "video/mp4" {
		t.Fatalf("large video metadata: %+v, stat: %v, err: %v", result.Media, stat, err)
	}
	spills, err := os.ReadDir(spillDir)
	if err != nil || len(spills) != 0 {
		t.Fatalf("multipart spill files: %v, %v", spills, err)
	}
}

func rejectUploadHandler(t *testing.T) *MediaHandler {
	t.Helper()
	t.Setenv("TMPDIR", t.TempDir())
	return NewMediaHandler(nil, nil, &config.UploadConfig{Dir: t.TempDir(), MaxImageMB: 1, MaxAudioMB: 2, MaxVideoMB: 3})
}

func serveUpload(h *MediaHandler, req *http.Request) *httptest.ResponseRecorder {
	r := gin.New()
	r.POST("/upload", h.Upload)
	response := httptest.NewRecorder()
	r.ServeHTTP(response, req)
	return response
}

func assertUploadDirectoryEmpty(t *testing.T, h *MediaHandler) {
	t.Helper()
	files, err := os.ReadDir(h.cfg.Dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 0 {
		t.Fatalf("failed upload left files: %v", files)
	}
}

func TestUploadRejectsUnsupportedExtensionBeforeReadingLargeBody(t *testing.T) {
	h := rejectUploadHandler(t)
	req, counted := largeUpload(t, "oversized.invalid", 100<<20)
	response := serveUpload(h, req)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status %d: %s", response.Code, response.Body)
	}
	if counted.read > 64<<10 {
		t.Fatalf("unsupported file consumed %d bytes before rejection", counted.read)
	}
	assertUploadDirectoryEmpty(t, h)
}

func TestUploadStopsAtTypeLimitWithoutLeavingPartialFiles(t *testing.T) {
	for _, tc := range []struct {
		filename string
		limit    int64
	}{{"oversized.png", 1 << 20}, {"oversized.mp3", 2 << 20}, {"oversized.mp4", 3 << 20}, {"oversized.zip", 1 << 20}} {
		t.Run(tc.filename, func(t *testing.T) {
			h := rejectUploadHandler(t)
			req, counted := largeUpload(t, tc.filename, tc.limit+(1<<20))
			response := serveUpload(h, req)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("status %d: %s", response.Code, response.Body)
			}
			if counted.read > tc.limit+(64<<10) {
				t.Fatalf("type limit consumed %d bytes", counted.read)
			}
			assertUploadDirectoryEmpty(t, h)
		})
	}
}

func TestUploadMalformedAndOversizedFormsRemovePartialFiles(t *testing.T) {
	for _, failure := range []string{"missing boundary", "large field", "duplicate file", "wrong mime"} {
		t.Run(failure, func(t *testing.T) {
			h := rejectUploadHandler(t)
			var body bytes.Buffer
			w := multipart.NewWriter(&body)
			part, _ := w.CreateFormFile("file", "photo.png")
			part.Write([]byte("not actually an image"))
			switch failure {
			case "large field":
				w.WriteField("tag_ids", strings.Repeat("a", (64<<10)+1))
			case "duplicate file":
				part, _ = w.CreateFormFile("file", "another.png")
				part.Write([]byte("second file"))
			}
			if failure != "missing boundary" {
				w.Close()
			}
			req := httptest.NewRequest(http.MethodPost, "/upload", &body)
			req.Header.Set("Content-Type", w.FormDataContentType())
			response := serveUpload(h, req)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("status %d: %s", response.Code, response.Body)
			}
			assertUploadDirectoryEmpty(t, h)
		})
	}
}

func TestUploadDatabaseFailureRemovesOriginalAndThumbnail(t *testing.T) {
	h, db, userID := mediaTestHandler(t)
	var filesBeforeFailure int
	if err := db.Callback().Create().Before("gorm:create").Register("upload_fail", func(tx *gorm.DB) {
		if tx.Statement.Schema != nil && tx.Statement.Schema.Name == "Media" {
			files, err := os.ReadDir(h.cfg.Dir)
			if err != nil {
				t.Fatal(err)
			}
			filesBeforeFailure = len(files)
			tx.AddError(errors.New("simulated database failure"))
		}
	}); err != nil {
		t.Fatal(err)
	}
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	part, _ := w.CreateFormFile("file", "photo.png")
	if err := png.Encode(part, image.NewRGBA(image.Rect(0, 0, 20, 10))); err != nil {
		t.Fatal(err)
	}
	w.Close()
	r := gin.New()
	r.POST("/upload", func(c *gin.Context) { c.Set("user_id", userID.String()); h.Upload(c) })
	req := httptest.NewRequest(http.MethodPost, "/upload", &body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	response := httptest.NewRecorder()
	r.ServeHTTP(response, req)
	if response.Code != http.StatusInternalServerError || filesBeforeFailure != 2 {
		t.Fatalf("status %d, files before database failure %d: %s", response.Code, filesBeforeFailure, response.Body)
	}
	assertUploadDirectoryEmpty(t, h)
}

func TestUploadCancellationStopsReadingAndRemovesPartialFiles(t *testing.T) {
	h := rejectUploadHandler(t)
	req, counted := largeUpload(t, "interrupted.png", 2<<20)
	ctx, cancel := context.WithCancel(req.Context())
	defer cancel()
	counted.cancel = cancel
	response := serveUpload(h, req.WithContext(ctx))
	if response.Code < 400 {
		t.Fatalf("cancelled upload succeeded: %d", response.Code)
	}
	if counted.read > 128<<10 {
		t.Fatalf("cancelled upload kept reading: %d bytes", counted.read)
	}
	assertUploadDirectoryEmpty(t, h)
}

func TestUploadTagsBeforeAndAfterFilePreserveImageMetadata(t *testing.T) {
	for _, tagsFirst := range []bool{true, false} {
		t.Run(map[bool]string{true: "before", false: "after"}[tagsFirst], func(t *testing.T) {
			h, db, userID := mediaTestHandler(t)
			tag, err := h.repo.CreateTag("photo")
			if err != nil {
				t.Fatal(err)
			}
			var body bytes.Buffer
			w := multipart.NewWriter(&body)
			if tagsFirst {
				w.WriteField("tag_ids", tag.ID.String())
			}
			part, _ := w.CreateFormFile("file", "photo.png")
			var imageBytes bytes.Buffer
			png.Encode(&imageBytes, image.NewRGBA(image.Rect(0, 0, 20, 10)))
			part.Write(imageBytes.Bytes())
			if !tagsFirst {
				w.WriteField("tag_ids", tag.ID.String())
			}
			w.Close()
			r := gin.New()
			r.POST("/upload", func(c *gin.Context) { c.Set("user_id", userID.String()); h.Upload(c) })
			req := httptest.NewRequest("POST", "/upload", &body)
			req.Header.Set("Content-Type", w.FormDataContentType())
			response := httptest.NewRecorder()
			r.ServeHTTP(response, req)
			if response.Code != http.StatusCreated {
				t.Fatalf("status %d: %s", response.Code, response.Body)
			}
			var result struct {
				Media model.Media `json:"media"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if len(result.Media.Tags) != 1 || result.Media.Tags[0].ID != tag.ID || result.Media.Size != int64(imageBytes.Len()) || result.Media.ThumbnailURL == "" {
				t.Fatalf("metadata not preserved: %+v", result.Media)
			}
			var count int64
			db.Model(&model.GalleryImage{}).Count(&count)
			if count != 1 {
				t.Fatalf("gallery rows: %d", count)
			}
		})
	}
}
