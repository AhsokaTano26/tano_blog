package handler

import (
	"context"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm/clause"

	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
)

func TestPostBatchDeleteUsesStableUUIDOrder(t *testing.T) {
	db, _ := contentDB(t)
	low := model.Post{ID: uuid.MustParse("00000000-0000-0000-0000-000000000001"), Title: "low", Slug: "delete-low", Content: "fixture"}
	high := model.Post{ID: uuid.MustParse("00000000-0000-0000-0000-000000000002"), Title: "high", Slug: "delete-high", Content: "fixture"}
	contentCreate(t, db, &low)
	contentCreate(t, db, &high)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	locked := db.WithContext(ctx).Begin()
	if locked.Error != nil {
		t.Fatal(locked.Error)
	}
	defer locked.Rollback()
	var row model.Post
	if err := locked.Clauses(clause.Locking{Strength: "UPDATE"}).First(&row, high.ID).Error; err != nil {
		t.Fatal(err)
	}
	h := NewPostHandler(repository.NewPostRepo(db), "test")
	router := gin.New()
	router.POST("/batch-delete", h.BatchDelete)
	done := make(chan *httptest.ResponseRecorder, 1)
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		response := httptest.NewRecorder()
		request := httptest.NewRequest("POST", "/batch-delete", strings.NewReader(fmt.Sprintf(`{"ids":[%q,%q]}`, high.ID, low.ID))).WithContext(ctx)
		request.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(response, request)
		done <- response
	}()
	defer func() {
		cancel()
		select {
		case <-finished:
		case <-time.After(time.Second):
			t.Error("batch deletion did not stop after cancellation")
		}
	}()
	// H remains externally locked. A sorted batch must commit L's independent
	// deletion first, despite the client submitting [H, L].
	ticker := time.NewTicker(5 * time.Millisecond)
	defer ticker.Stop()
	for {
		var count int64
		if err := db.WithContext(ctx).Model(&model.Post{}).Where("id = ?", low.ID).Count(&count).Error; err != nil {
			t.Fatal(err)
		}
		if count == 0 {
			break
		}
		select {
		case <-ticker.C:
		case <-ctx.Done():
			t.Fatal("batch deletion waited for the higher UUID before deleting the lower UUID")
		}
	}
	if err := locked.Rollback().Error; err != nil {
		t.Fatal(err)
	}
	select {
	case response := <-done:
		if response.Code != 200 {
			t.Fatalf("batch deletion failed: %d %s", response.Code, response.Body)
		}
	case <-ctx.Done():
		t.Fatal("batch deletion did not finish after releasing the higher UUID")
	}
}
