package service

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
)

func TestAIRequestCancelsWithCaller(t *testing.T) {
	entered := make(chan struct{})
	cancelled := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		close(entered)
		<-r.Context().Done()
		close(cancelled)
	}))
	defer server.Close()
	db := testutil.Database(t, &model.SiteConfig{})
	for k, v := range map[string]string{"ai_enabled": "true", "ai_api_key": "local-test", "ai_api_url": server.URL} {
		if err := db.Create(&model.SiteConfig{Key: k, Value: v}).Error; err != nil {
			t.Fatal(err)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	result := make(chan error, 1)
	go func() { _, err := NewAIService(db.WithContext(ctx)).GenerateExcerpt("article"); result <- err }()
	<-entered
	cancel()
	select {
	case err := <-result:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("error=%v", err)
		}
	case <-time.After(time.Second):
		server.CloseClientConnections()
		t.Fatal("upstream kept running after caller cancellation")
	}
	select {
	case <-cancelled:
	case <-time.After(time.Second):
		t.Fatal("upstream context did not cancel")
	}
}

func TestAIRejectsOversizedResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, strings.Repeat("x", (1<<20)+1)) }))
	defer server.Close()
	db := testutil.Database(t, &model.SiteConfig{})
	for k, v := range map[string]string{"ai_enabled": "true", "ai_api_key": "local-test", "ai_api_url": server.URL} {
		if err := db.Create(&model.SiteConfig{Key: k, Value: v}).Error; err != nil {
			t.Fatal(err)
		}
	}
	_, err := NewAIService(db).GenerateExcerpt("article")
	if err == nil || !strings.Contains(err.Error(), "response exceeds") {
		t.Fatalf("expected size error, got %v", err)
	}
}
