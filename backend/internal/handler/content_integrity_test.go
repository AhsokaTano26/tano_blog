package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"image"
	"image/png"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/testutil"
	"testing"
	"time"
)

func contentDB(t *testing.T) (*gorm.DB, model.User) {
	t.Helper()
	db := testutil.Database(t)
	if err := model.AutoMigrate(db); err != nil {
		t.Fatal(err)
	}
	user := model.User{Username: "integrity", Email: "integrity@example.test", PasswordHash: "unused", Role: "admin"}
	contentCreate(t, db, &user)
	return db, user
}
func contentCreate(t *testing.T, db *gorm.DB, v any) {
	t.Helper()
	if err := db.Create(v).Error; err != nil {
		t.Fatal(err)
	}
}
func contentCall(t *testing.T, u model.User, h gin.HandlerFunc, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("user_id", u.ID.String()); c.Set("role", "admin"); c.Next() })
	r.Handle(method, "/:id", h)
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}
func contentPost(t *testing.T, db *gorm.DB, id uuid.UUID) *model.Post {
	t.Helper()
	p, err := repository.NewPostRepo(db).GetByID(id)
	if err != nil {
		t.Fatal(err)
	}
	return p
}
func contentSchedule(t *testing.T, db *gorm.DB, id uuid.UUID) *time.Time {
	t.Helper()
	var row struct{ ScheduledAt *time.Time }
	if err := db.Model(&model.Post{}).Select("scheduled_at").Where("id = ?", id).Scan(&row).Error; err != nil {
		t.Fatal(err)
	}
	return row.ScheduledAt
}
func TestContentRSSExcludesProtectedPostsAndDisablesCaching(t *testing.T) {
	db, _ := contentDB(t)
	p := model.Post{Title: "protected", Slug: "protected", Content: "private-secret-body", Excerpt: "private-summary", Status: "published", PasswordHash: "secret"}
	contentCreate(t, db, &p)
	public := model.Post{Title: "public", Slug: "public", Content: "public-body", Status: "published"}
	contentCreate(t, db, &public)
	r := gin.New()
	r.GET("/rss.xml", NewFeedHandler(db).RSS)
	read := func() *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", "/rss.xml", nil))
		return w
	}
	w := read()
	if w.Code != 200 || strings.Contains(w.Body.String(), "private-") || !strings.Contains(w.Body.String(), "public-body") {
		t.Errorf("unsafe RSS: %d %s", w.Code, w.Body)
	}
	if !strings.Contains(w.Header().Get("Cache-Control"), "no-store") {
		t.Errorf("feed allows stale private content: %s", w.Header().Get("Cache-Control"))
	}
	if err := db.Model(&public).Update("password_hash", "now-protected").Error; err != nil {
		t.Fatal(err)
	}
	if w = read(); strings.Contains(w.Body.String(), "public-body") {
		t.Error("newly protected body still exposed")
	}
}
func TestContentCreatePersistsFalseCommentAndSeries(t *testing.T) {
	db, u := contentDB(t)
	s := model.Series{Name: "s", Slug: "s"}
	contentCreate(t, db, &s)
	h := NewPostHandler(repository.NewPostRepo(db), "test")
	w := contentCall(t, u, h.Create, "POST", "/create", fmt.Sprintf(`{"title":"created","slug":"created","allow_comment":false,"series_id":%q}`, s.ID))
	if w.Code != 201 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	var p model.Post
	db.Where("slug = ?", "created").First(&p)
	saved := contentPost(t, db, p.ID)
	if saved.AllowComment || len(saved.Series) != 1 || saved.Series[0].ID != s.ID {
		t.Fatalf("allow_comment=%t series=%v", saved.AllowComment, saved.Series)
	}
}
func TestContentUpdateClearsExplicitValues(t *testing.T) {
	for _, empty := range []string{`""`, `null`} {
		t.Run(empty, func(t *testing.T) {
			db, u := contentDB(t)
			cat := model.Category{Name: "c", Slug: "c"}
			tag := model.Tag{Name: "t", Slug: "t"}
			s := model.Series{Name: "s", Slug: "s"}
			contentCreate(t, db, &cat)
			contentCreate(t, db, &tag)
			contentCreate(t, db, &s)
			p := model.Post{Title: "p", Slug: "p", Content: "body", Excerpt: "summary", CoverImage: "cover.png", CategoryID: &cat.ID, Tags: []model.Tag{tag}, Series: []model.Series{s}}
			contentCreate(t, db, &p)
			h := NewPostHandler(repository.NewPostRepo(db), "test")
			w := contentCall(t, u, h.Update, "PUT", "/"+p.ID.String(), fmt.Sprintf(`{"content":"","excerpt":"","cover_image":"","tag_ids":[],"category_id":%s,"series_id":%s,"scheduled_at":%s}`, empty, empty, empty))
			saved := contentPost(t, db, p.ID)
			if w.Code != 200 || saved.Content != "" || saved.Excerpt != "" || saved.CoverImage != "" || len(saved.Tags) != 0 || len(saved.Series) != 0 || saved.CategoryID != nil {
				t.Fatalf("%d %s stored=%+v", w.Code, w.Body, saved)
			}
		})
	}
}
func TestContentPublishedEditsPreserveDate(t *testing.T) {
	db, u := contentDB(t)
	past := time.Date(2025, 10, 16, 1, 0, 0, 0, time.UTC)
	p := model.Post{Title: "old", Slug: "old", Status: "published", PublishedAt: &past}
	contentCreate(t, db, &p)
	h := NewPostHandler(repository.NewPostRepo(db), "test")
	w := contentCall(t, u, h.Update, "PUT", "/"+p.ID.String(), `{"title":"corrected","status":"published"}`)
	saved := contentPost(t, db, p.ID)
	if w.Code != 200 || saved.PublishedAt == nil || !saved.PublishedAt.Equal(past) {
		t.Fatalf("%d published_at=%v", w.Code, saved.PublishedAt)
	}
}
func TestContentSchedulesUseIndependentTimestampAndTimezone(t *testing.T) {
	for _, stamp := range []string{"2030-10-17T09:00", "2030-10-17T09:00:00+08:00"} {
		t.Run(stamp, func(t *testing.T) {
			db, u := contentDB(t)
			h := NewPostHandler(repository.NewPostRepo(db), "test")
			w := contentCall(t, u, h.Create, "POST", "/create", fmt.Sprintf(`{"title":"scheduled","slug":"scheduled","status":"draft","scheduled_at":%q}`, stamp))
			if w.Code != 201 {
				t.Fatalf("%d %s", w.Code, w.Body)
			}
			var p model.Post
			db.Where("slug = ?", "scheduled").First(&p)
			planned := contentSchedule(t, db, p.ID)
			want := time.Date(2030, 10, 17, 1, 0, 0, 0, time.UTC)
			if p.PublishedAt != nil || planned == nil || !planned.Equal(want) {
				t.Fatalf("published=%v scheduled=%v want %v", p.PublishedAt, planned, want)
			}
		})
	}
}
func TestContentWithdrawalCancelsEveryPublishPath(t *testing.T) {
	db, u := contentDB(t)
	repo := repository.NewPostRepo(db)
	h := NewPostHandler(repo, "test")
	scheduler, ok := any(repo).(interface {
		PublishScheduled(time.Time) (int64, error)
	})
	if !ok {
		t.Fatal("scheduler must use explicit scheduled_at, not published_at")
	}
	for _, mode := range []string{"status", "batch", "edit"} {
		t.Run(mode, func(t *testing.T) {
			past := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
			p := model.Post{Title: mode, Slug: mode, Status: "published", PublishedAt: &past}
			contentCreate(t, db, &p)
			if err := db.Model(&p).Update("scheduled_at", time.Now().Add(-time.Hour)).Error; err != nil {
				t.Fatal(err)
			}
			fn := h.UpdateStatus
			body := `{"status":"draft"}`
			if mode == "batch" {
				fn = h.BatchUpdateStatus
				body = fmt.Sprintf(`{"ids":[%q],"status":"draft"}`, p.ID)
			}
			if mode == "edit" {
				fn = h.Update
			}
			w := contentCall(t, u, fn, "PUT", "/"+p.ID.String(), body)
			if w.Code != 200 {
				t.Fatalf("%d %s", w.Code, w.Body)
			}
			if _, err := scheduler.PublishScheduled(time.Now()); err != nil {
				t.Fatal(err)
			}
			saved := contentPost(t, db, p.ID)
			if saved.Status != "draft" || contentSchedule(t, db, p.ID) != nil || saved.PublishedAt == nil || !saved.PublishedAt.Equal(past) {
				t.Fatalf("withdrawal lost: %+v", saved)
			}
		})
	}
	p := model.Post{Title: "due", Slug: "due", Status: "draft"}
	contentCreate(t, db, &p)
	due := time.Now().Add(-time.Hour)
	if err := db.Model(&p).Update("scheduled_at", due).Error; err != nil {
		t.Fatal(err)
	}
	if n, err := scheduler.PublishScheduled(time.Now()); err != nil || n != 1 {
		t.Fatalf("due publish %d %v", n, err)
	}
	saved := contentPost(t, db, p.ID)
	if saved.Status != "published" || saved.PublishedAt == nil || contentSchedule(t, db, p.ID) != nil {
		t.Fatalf("due post %+v", saved)
	}
}
func TestContentRejectsOverlongPasswordBeforeWriting(t *testing.T) {
	db, u := contentDB(t)
	h := NewPostHandler(repository.NewPostRepo(db), "test")
	password := strings.Repeat("密", 25)
	w := contentCall(t, u, h.Create, "POST", "/create", fmt.Sprintf(`{"title":"p","slug":"p","status":"published","password":%q}`, password))
	var n int64
	db.Model(&model.Post{}).Count(&n)
	if w.Code != 400 || n != 0 {
		t.Errorf("overlong password creates unprotected post: %d rows=%d", w.Code, n)
	}
	p := model.Post{Title: "protected", Slug: "protected", PasswordHash: "original"}
	contentCreate(t, db, &p)
	w = contentCall(t, u, h.Update, "PUT", "/"+p.ID.String(), fmt.Sprintf(`{"title":"changed","password":%q}`, password))
	saved := contentPost(t, db, p.ID)
	if w.Code != 400 || saved.Title != "protected" || saved.PasswordHash != "original" {
		t.Fatalf("invalid password update partially committed: %d %+v", w.Code, saved)
	}
}
func TestContentPostAssociationsRollbackOnFailure(t *testing.T) {
	db, u := contentDB(t)
	h := NewPostHandler(repository.NewPostRepo(db), "test")
	tag := model.Tag{Name: "t", Slug: "t"}
	contentCreate(t, db, &tag)
	missing := uuid.New()
	w := contentCall(t, u, h.Create, "POST", "/create", fmt.Sprintf(`{"title":"create","slug":"create","series_id":%q}`, missing))
	var n int64
	db.Model(&model.Post{}).Count(&n)
	if w.Code < 400 || n != 0 {
		t.Errorf("invalid series create committed: %d rows=%d", w.Code, n)
	}
	p := model.Post{Title: "original", Slug: "original", Tags: []model.Tag{tag}}
	contentCreate(t, db, &p)
	for _, body := range []string{fmt.Sprintf(`{"title":"changed","tag_ids":[%q]}`, missing), fmt.Sprintf(`{"title":"changed","series_id":%q,"tag_ids":[]}`, missing)} {
		w = contentCall(t, u, h.Update, "PUT", "/"+p.ID.String(), body)
		saved := contentPost(t, db, p.ID)
		db.Model(&model.PostRevision{}).Where("post_id = ?", p.ID).Count(&n)
		if w.Code < 400 || saved.Title != "original" || len(saved.Tags) != 1 || n != 0 {
			t.Fatalf("failed association committed partial update: %d title=%s tags=%d revisions=%d", w.Code, saved.Title, len(saved.Tags), n)
		}
	}
}
func TestContentAdminSearchFiltersCountAndItems(t *testing.T) {
	db, u := contentDB(t)
	contentCreate(t, db, &model.Post{Title: "Needle", Slug: "needle"})
	contentCreate(t, db, &model.Post{Title: "unrelated", Slug: "other"})
	w := contentCall(t, u, NewPostHandler(repository.NewPostRepo(db), "test").AdminList, "GET", "/list?search=needle", "")
	var response struct {
		Items []model.Post `json:"items"`
		Total int          `json:"total"`
	}
	json.Unmarshal(w.Body.Bytes(), &response)
	if w.Code != 200 || response.Total != 1 || len(response.Items) != 1 || response.Items[0].Slug != "needle" {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}
func TestContentTaggedMediaDeletionPreservesFilesOnDBFailure(t *testing.T) {
	for _, batch := range []bool{false, true} {
		for _, blocked := range []bool{false, true} {
			t.Run(fmt.Sprintf("batch=%t/blocked=%t", batch, blocked), func(t *testing.T) {
				db, u := contentDB(t)
				dir := t.TempDir()
				tag := model.MediaTag{Name: "tag"}
				contentCreate(t, db, &tag)
				m := model.Media{Filename: "photo.png", URL: "/uploads/photo.png", UploadedBy: u.ID, Tags: []model.MediaTag{tag}}
				contentCreate(t, db, &m)
				path := filepath.Join(dir, m.Filename)
				if err := os.WriteFile(path, []byte("photo"), 0600); err != nil {
					t.Fatal(err)
				}
				if blocked {
					if err := db.Exec("CREATE TABLE media_blocker (media_id uuid REFERENCES media(id))").Error; err != nil {
						t.Fatal(err)
					}
					if err := db.Exec("INSERT INTO media_blocker VALUES (?)", m.ID).Error; err != nil {
						t.Fatal(err)
					}
				}
				h := NewMediaHandler(repository.NewMediaRepo(db), repository.NewGalleryRepo(db), &config.UploadConfig{Dir: dir})
				fn := h.Delete
				method := "DELETE"
				body := ""
				if batch {
					fn = h.BatchDelete
					method = "POST"
					body = fmt.Sprintf(`{"ids":[%q]}`, m.ID)
				}
				w := contentCall(t, u, fn, method, "/"+m.ID.String(), body)
				_, fileErr := os.Stat(path)
				var n int64
				db.Model(&model.Media{}).Where("id = ?", m.ID).Count(&n)
				if blocked {
					if w.Code != 500 || fileErr != nil || n != 1 {
						t.Fatalf("DB failure lost file: %d file=%v rows=%d", w.Code, fileErr, n)
					}
				} else if w.Code != 200 || !os.IsNotExist(fileErr) || n != 0 {
					t.Fatalf("tagged deletion failed: %d file=%v rows=%d", w.Code, fileErr, n)
				}
			})
		}
	}
}
func TestContentMediaBatchTagsReplaceAndClear(t *testing.T) {
	db, u := contentDB(t)
	tag := model.MediaTag{Name: "t"}
	contentCreate(t, db, &tag)
	a := model.Media{Filename: "a", URL: "/uploads/a", UploadedBy: u.ID}
	b := model.Media{Filename: "b", URL: "/uploads/b", UploadedBy: u.ID}
	contentCreate(t, db, &a)
	contentCreate(t, db, &b)
	repo := repository.NewMediaRepo(db)
	ids := []uuid.UUID{a.ID, b.ID}
	if err := repo.BatchUpdateTags(ids, []uuid.UUID{tag.ID}); err != nil {
		t.Fatal(err)
	}
	for _, id := range ids {
		m, err := repo.GetByID(id)
		if err != nil || len(m.Tags) != 1 {
			t.Fatalf("tags not saved %+v %v", m, err)
		}
	}
	if err := repo.BatchUpdateTags(ids, nil); err != nil {
		t.Fatal(err)
	}
	var n int64
	db.Table("media_tag_links").Count(&n)
	if n != 0 {
		t.Fatalf("cleared tags=%d", n)
	}
}
func TestContentDeletesDependentRecords(t *testing.T) {
	db, _ := contentDB(t)
	cat := model.Category{Name: "c", Slug: "c"}
	tag := model.Tag{Name: "t", Slug: "t"}
	s := model.Series{Name: "s", Slug: "s"}
	contentCreate(t, db, &cat)
	contentCreate(t, db, &tag)
	contentCreate(t, db, &s)
	p := model.Post{Title: "p", Slug: "p", CategoryID: &cat.ID, Tags: []model.Tag{tag}, Series: []model.Series{s}}
	contentCreate(t, db, &p)
	if err := repository.NewCategoryRepo(db).Delete(cat.ID); err != nil {
		t.Errorf("category: %v", err)
	} else if contentPost(t, db, p.ID).CategoryID != nil {
		t.Error("category not cleared")
	}
	if err := repository.NewTagRepo(db).Delete(tag.ID); err != nil {
		t.Errorf("tag: %v", err)
	}
	root := model.Comment{PostID: p.ID, Nickname: "root", Content: "root"}
	contentCreate(t, db, &root)
	child := model.Comment{PostID: p.ID, ParentID: &root.ID, Nickname: "child", Content: "child"}
	contentCreate(t, db, &child)
	contentCreate(t, db, &model.CommentRevision{CommentID: child.ID, Content: "history"})
	contentCreate(t, db, &model.CommentReaction{CommentID: child.ID, Emoji: "x", IPAddress: "203.0.113.1"})
	if err := repository.NewCommentRepo(db).Delete(root.ID); err != nil {
		t.Errorf("comment tree: %v", err)
	}
	contentCreate(t, db, &model.PostRevision{PostID: p.ID, Title: "history", Content: "history"})
	contentCreate(t, db, &model.PostReaction{PostID: p.ID, Emoji: "x", IPAddress: "203.0.113.1"})
	if err := repository.NewPostRepo(db).Delete(p.ID); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"posts", "comments", "post_tags", "post_series", "post_revisions", "post_reactions", "comment_revisions", "comment_reactions"} {
		var n int64
		db.Table(table).Count(&n)
		if n != 0 {
			t.Errorf("orphan %s: %d", table, n)
		}
	}
}

func TestContentFailedFileCleanupRemainsRetryable(t *testing.T) {
	db, u := contentDB(t)
	dir := t.TempDir()
	// A nonempty directory makes os.Remove fail reliably, without permission tricks.
	blocked := filepath.Join(dir, "blocked.png")
	if err := os.Mkdir(blocked, 0700); err != nil {
		t.Fatal(err)
	}
	child := filepath.Join(blocked, "keep")
	if err := os.WriteFile(child, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	m := model.Media{Filename: "blocked.png", URL: "/uploads/blocked.png", UploadedBy: u.ID}
	contentCreate(t, db, &m)
	h := NewMediaHandler(repository.NewMediaRepo(db), repository.NewGalleryRepo(db), &config.UploadConfig{Dir: dir})
	w := contentCall(t, u, h.Delete, "DELETE", "/"+m.ID.String(), "")
	if w.Code != 200 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	var jobs []model.MediaFileCleanup
	if err := db.Find(&jobs).Error; err != nil {
		t.Fatal(err)
	}
	if len(jobs) != 1 || jobs[0].LastError == "" {
		t.Fatalf("failed file removal lacks durable retry: %+v", jobs)
	}
	if err := os.Remove(child); err != nil {
		t.Fatal(err)
	}
	cleanup, ok := any(h).(interface{ CleanupDeletedFiles(context.Context) })
	if !ok {
		t.Fatal("cleanup cannot be retried")
	}
	cleanup.CleanupDeletedFiles(context.Background())
	var n int64
	db.Model(&model.MediaFileCleanup{}).Count(&n)
	if n != 0 {
		t.Fatalf("cleanup job still present: %d", n)
	}
	if _, err := os.Stat(blocked); !os.IsNotExist(err) {
		t.Fatalf("retry did not remove file: %v", err)
	}
}
func TestContentAdminSeriesSearchFiltersTotal(t *testing.T) {
	db, u := contentDB(t)
	for _, s := range []model.Series{{Name: "Needle", Slug: "first"}, {Name: "Other", Slug: "needle-slug"}, {Name: "Other series", Slug: "last"}} {
		contentCreate(t, db, &s)
	}
	w := contentCall(t, u, NewSeriesHandler(repository.NewSeriesRepo(db)).AdminList, "GET", "/list?search=needle&page_size=1&page=2", "")
	var response struct {
		Items []model.Series `json:"items"`
		Total int            `json:"total"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || response.Total != 2 || len(response.Items) != 1 || response.Items[0].Slug != "needle-slug" {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestContentBackfillGuardRejectsBeforeAnyFileWrite(t *testing.T) {
	h, db, userID := mediaTestHandler(t)
	m := model.Media{Filename: "legacy.png", URL: "/uploads/legacy.png", MimeType: "image/png", UploadedBy: userID}
	contentCreate(t, db, &m)
	path := filepath.Join(h.cfg.Dir, m.Filename)
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := png.Encode(f, image.NewRGBA(image.Rect(0, 0, 10, 10))); err != nil {
		t.Fatal(err)
	}
	f.Close()
	backfiller, ok := any(h).(interface {
		BackfillImageThumbnails(context.Context, ...func(context.Context) (func(), error)) error
	})
	if !ok {
		t.Fatal("backfill cannot honor standby/restore write guard")
	}
	denied := errors.New("standby")
	if err := backfiller.BackfillImageThumbnails(context.Background(), func(context.Context) (func(), error) { return nil, denied }); !errors.Is(err, denied) {
		t.Fatalf("guard error=%v", err)
	}
	var saved model.Media
	db.First(&saved, m.ID)
	files, err := os.ReadDir(h.cfg.Dir)
	if err != nil || saved.ThumbnailURL != "" || len(files) != 1 {
		t.Fatalf("guard rejection wrote files/DB: %+v files=%d err=%v", saved, len(files), err)
	}
	released := false
	if err := backfiller.BackfillImageThumbnails(context.Background(), func(context.Context) (func(), error) {
		return func() {
			released = true
			db.First(&saved, m.ID)
			if saved.ThumbnailURL == "" {
				t.Error("write lease released before DB update")
			}
			if _, err := os.Stat(filepath.Join(h.cfg.Dir, filepath.Base(saved.ThumbnailURL))); err != nil {
				t.Errorf("write lease released before thumbnail persisted: %v", err)
			}
		}, nil
	}); err != nil {
		t.Fatal(err)
	}
	if !released {
		t.Fatal("backfill never released its lease")
	}
}

func TestContentSharedMediaFilesSurviveUntilLastReference(t *testing.T) {
	db, u := contentDB(t)
	dir := t.TempDir()
	source := filepath.Join(dir, "shared.png")
	thumb := filepath.Join(dir, "shared_thumb.png")
	for _, path := range []string{source, thumb} {
		if err := os.WriteFile(path, []byte("shared"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	a := model.Media{Filename: "shared.png", URL: "/uploads/shared.png", ThumbnailURL: "/uploads/shared_thumb.png", UploadedBy: u.ID}
	contentCreate(t, db, &a)
	b := model.Media{Filename: a.Filename, URL: a.URL, ThumbnailURL: a.ThumbnailURL, UploadedBy: u.ID}
	contentCreate(t, db, &b)
	gallery := model.GalleryImage{URL: a.URL, Title: "shared"}
	contentCreate(t, db, &gallery)
	h := NewMediaHandler(repository.NewMediaRepo(db), repository.NewGalleryRepo(db), &config.UploadConfig{Dir: dir})
	w := contentCall(t, u, h.Delete, "DELETE", "/"+a.ID.String(), "")
	if w.Code != 200 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	for _, path := range []string{source, thumb} {
		if _, err := os.Stat(path); err != nil {
			t.Errorf("shared file deleted too early: %v", err)
		}
	}
	var n int64
	db.Model(&model.GalleryImage{}).Where("id = ?", gallery.ID).Count(&n)
	if n != 1 {
		t.Errorf("shared gallery removed prematurely")
	}
	w = contentCall(t, u, h.Delete, "DELETE", "/"+b.ID.String(), "")
	if w.Code != 200 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	for _, path := range []string{source, thumb} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Errorf("last reference file not removed: %v", err)
		}
	}
	db.Model(&model.GalleryImage{}).Where("id = ?", gallery.ID).Count(&n)
	if n != 0 {
		t.Error("deleted media left a broken gallery image")
	}
}

func TestContentScheduleClearAndDueBoundary(t *testing.T) {
	db, u := contentDB(t)
	now := time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)
	future := now.Add(time.Hour)
	past := now.Add(-time.Hour)
	repo := repository.NewPostRepo(db)
	h := NewPostHandler(repo, "test")
	for i, empty := range []string{`""`, `null`} {
		p := model.Post{Title: "cancel", Slug: fmt.Sprintf("cancel-%d", i), Status: "draft", ScheduledAt: &future}
		contentCreate(t, db, &p)
		w := contentCall(t, u, h.Update, "PUT", "/"+p.ID.String(), fmt.Sprintf(`{"scheduled_at":%s}`, empty))
		if w.Code != 200 {
			t.Fatalf("%d %s", w.Code, w.Body)
		}
		if saved := contentPost(t, db, p.ID); saved.ScheduledAt != nil {
			t.Fatalf("cancel retained schedule %v", saved.ScheduledAt)
		}
	}
	for _, tc := range []struct {
		slug, status string
		scheduled    *time.Time
	}{{"due", "draft", &now}, {"future", "draft", &future}, {"plain", "draft", nil}, {"already-public", "published", &past}} {
		contentCreate(t, db, &model.Post{Title: tc.slug, Slug: tc.slug, Status: tc.status, ScheduledAt: tc.scheduled})
	}
	if n, err := repo.PublishScheduled(now); err != nil || n != 1 {
		t.Fatalf("boundary published %d posts: %v", n, err)
	}
	var due model.Post
	if err := db.Where("slug = ?", "due").First(&due).Error; err != nil {
		t.Fatal(err)
	}
	if due.Status != "published" || due.PublishedAt == nil || !due.PublishedAt.Equal(now) || due.ScheduledAt != nil {
		t.Fatalf("due=%+v", due)
	}
	if n, err := repo.PublishScheduled(now); err != nil || n != 0 {
		t.Fatalf("replayed scheduler %d %v", n, err)
	}
}
