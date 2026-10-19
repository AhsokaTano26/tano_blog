package handler

import (
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
)

func TestPostUpdateRejectsStaleVersionWithoutSideEffects(t *testing.T) {
	db, user := contentDB(t)
	post := model.Post{Title: "original", Slug: "conflict", Content: "original"}
	contentCreate(t, db, &post)
	h := NewPostHandler(repository.NewPostRepo(db), "test")
	version := contentPost(t, db, post.ID).UpdatedAt.Format(time.RFC3339Nano)
	body := fmt.Sprintf(`{"content":"first","expected_updated_at":%q}`, version)
	if w := contentCall(t, user, h.Update, "PUT", "/"+post.ID.String(), body); w.Code != 200 {
		t.Fatalf("first update: %d %s", w.Code, w.Body)
	}
	first := contentPost(t, db, post.ID)
	if first.UpdatedAt.Format(time.RFC3339Nano) == version {
		t.Fatal("accepted save did not advance its version")
	}
	w := contentCall(t, user, h.Update, "PUT", "/"+post.ID.String(), fmt.Sprintf(`{"content":"stale","tag_ids":[],"expected_updated_at":%q}`, version))
	if w.Code != 409 {
		t.Fatalf("stale update: %d %s", w.Code, w.Body)
	}
	var result struct {
		Code        string     `json:"code"`
		CurrentPost model.Post `json:"current_post"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Code != "post_conflict" || result.CurrentPost.Content != "first" || !result.CurrentPost.UpdatedAt.Equal(first.UpdatedAt) {
		t.Fatalf("conflict lacks current baseline: %s", w.Body)
	}
	if saved := contentPost(t, db, post.ID); saved.Content != "first" || !saved.UpdatedAt.Equal(first.UpdatedAt) {
		t.Fatal("conflict mutated saved article")
	}
	var revisions int64
	if err := db.Model(&model.PostRevision{}).Where("post_id = ?", post.ID).Count(&revisions).Error; err != nil || revisions != 1 {
		t.Fatalf("conflict added a revision: %d %v", revisions, err)
	}
}

func TestPostRevisionRestoreHonorsVersionAndPostIdentity(t *testing.T) {
	db, user := contentDB(t)
	post := model.Post{Title: "current", Slug: "restore-version", Content: "current"}
	other := model.Post{Title: "other", Slug: "restore-other", Content: "other"}
	contentCreate(t, db, &post)
	contentCreate(t, db, &other)
	rev := model.PostRevision{PostID: post.ID, Title: "old", Content: "old"}
	contentCreate(t, db, &rev)
	h := NewPostHandler(repository.NewPostRepo(db), "test")
	version := contentPost(t, db, post.ID).UpdatedAt.Format(time.RFC3339Nano)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("user_id", user.ID.String()); c.Next() })
	r.POST("/:id/revisions/:revId/restore", h.RestoreRevision)
	restore := func(id, expected string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		req := httptest.NewRequest("POST", "/"+id+"/revisions/"+rev.ID.String()+"/restore", strings.NewReader(fmt.Sprintf(`{"expected_updated_at":%q}`, expected)))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)
		return w
	}
	if w := restore(other.ID.String(), version); w.Code != 404 {
		t.Fatalf("cross-article revision: %d", w.Code)
	}
	if w := restore(post.ID.String(), version); w.Code != 200 {
		t.Fatalf("restore: %d %s", w.Code, w.Body)
	}
	if w := restore(post.ID.String(), version); w.Code != 409 {
		t.Fatalf("stale restore: %d", w.Code)
	}
	var count int64
	db.Model(&model.PostRevision{}).Where("post_id = ?", post.ID).Count(&count)
	if count != 2 {
		t.Fatalf("expected original and one pre-restore snapshot, got %d", count)
	}
}

func TestPostUpdateRejectsMalformedVersion(t *testing.T) {
	db, user := contentDB(t)
	post := model.Post{Title: "original", Slug: "invalid-version", Content: "original"}
	contentCreate(t, db, &post)
	h := NewPostHandler(repository.NewPostRepo(db), "test")
	for _, version := range []string{`""`, `"not-a-time"`, `null`, `42`} {
		w := contentCall(t, user, h.Update, "PUT", "/"+post.ID.String(), `{"content":"bad","expected_updated_at":`+version+`}`)
		if w.Code != 400 {
			t.Fatalf("invalid precondition %s: %d", version, w.Code)
		}
	}
	if contentPost(t, db, post.ID).Content != "original" {
		t.Fatal("invalid precondition changed content")
	}
}

func TestPreviewRotationDoesNotInvalidateContentVersion(t *testing.T) {
	db, user := contentDB(t)
	post := model.Post{Title: "preview", Slug: "preview-version", Content: "content"}
	contentCreate(t, db, &post)
	h := NewPostHandler(repository.NewPostRepo(db), "test")
	before := contentPost(t, db, post.ID)
	w := contentCall(t, user, h.GeneratePreviewToken, "POST", "/"+post.ID.String(), "")
	if w.Code != 200 {
		t.Fatalf("preview: %d", w.Code)
	}
	after := contentPost(t, db, post.ID)
	if !after.UpdatedAt.Equal(before.UpdatedAt) {
		t.Fatal("generating a preview made the content editor stale")
	}
	if after.PreviewToken == before.PreviewToken || after.PreviewToken == "" {
		t.Fatal("token was not rotated")
	}
	w = contentCall(t, user, h.Update, "PUT", "/"+post.ID.String(), fmt.Sprintf(`{"content":"after preview","expected_updated_at":%q}`, before.UpdatedAt.Format(time.RFC3339Nano)))
	if w.Code != 200 {
		t.Fatalf("save after preview: %d", w.Code)
	}
}

func TestPostConcurrentVersionedSavesHaveOneWinner(t *testing.T) {
	db, user := contentDB(t)
	post := model.Post{Title: "original", Slug: "concurrent-version", Content: "original"}
	contentCreate(t, db, &post)
	h := NewPostHandler(repository.NewPostRepo(db), "test")
	version := contentPost(t, db, post.ID).UpdatedAt.Format(time.RFC3339Nano)
	start := make(chan struct{})
	statuses := make(chan int, 2)
	var wg sync.WaitGroup
	for _, content := range []string{"one", "two"} {
		wg.Add(1)
		go func(content string) {
			defer wg.Done()
			<-start
			w := contentCall(t, user, h.Update, "PUT", "/"+post.ID.String(), fmt.Sprintf(`{"content":%q,"expected_updated_at":%q}`, content, version))
			statuses <- w.Code
		}(content)
	}
	close(start)
	wg.Wait()
	close(statuses)
	counts := map[int]int{}
	for status := range statuses {
		counts[status]++
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatalf("concurrent outcomes = %v", counts)
	}
}
