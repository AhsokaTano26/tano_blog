package handler

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
)

func TestSeriesMembershipChangeRejectsStaleArticleSave(t *testing.T) {
	db, user := contentDB(t)
	post := model.Post{Title: "original", Slug: "series-conflict", Content: "original"}
	s := model.Series{Name: "new series", Slug: "series-conflict"}
	contentCreate(t, db, &post)
	contentCreate(t, db, &s)
	version := contentPost(t, db, post.ID).UpdatedAt.Format(time.RFC3339Nano)
	if err := repository.NewSeriesRepo(db).SetPosts(s.ID, []uuid.UUID{post.ID}); err != nil {
		t.Fatal(err)
	}
	h := NewPostHandler(repository.NewPostRepo(db), "test")
	w := contentCall(t, user, h.Update, "PUT", "/"+post.ID.String(), fmt.Sprintf(`{"content":"stale editor content","series_id":"","expected_updated_at":%q}`, version))
	if w.Code != 409 {
		t.Fatalf("stale article save overwrote the new membership: %d %s", w.Code, w.Body)
	}
	var response struct {
		Code        string     `json:"code"`
		CurrentPost model.Post `json:"current_post"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Code != "post_conflict" || len(response.CurrentPost.Series) != 1 || response.CurrentPost.Series[0].ID != s.ID || response.CurrentPost.UpdatedAt.Format(time.RFC3339Nano) == version {
		t.Fatalf("conflict response lacks the latest series baseline: %s", w.Body)
	}
	saved := contentPost(t, db, post.ID)
	if saved.Content != "original" || len(saved.Series) != 1 || saved.Series[0].ID != s.ID {
		t.Fatalf("stale save mutated content or membership: %+v", saved)
	}
}
