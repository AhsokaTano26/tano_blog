package repository

import (
	"net/url"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"tano_blog/backend/internal/model"
)

func TestConcurrentGalleryAppendsHaveDistinctOrder(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_DSN")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_DSN to run PostgreSQL integration tests")
	}
	root, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	pool, _ := root.DB()
	t.Cleanup(func() { pool.Close() })
	schema := "gallery_test_" + uuid.New().String()[:8]
	if err := root.Exec("CREATE SCHEMA " + schema).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { root.Exec("DROP SCHEMA " + schema + " CASCADE") })
	parsed, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	db, err := gorm.Open(postgres.Open(parsed.String()), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	connections, _ := db.DB()
	t.Cleanup(func() { connections.Close() })
	if err := db.AutoMigrate(&model.GalleryImage{}); err != nil {
		t.Fatal(err)
	}
	repo := NewGalleryRepo(db)
	var workers sync.WaitGroup
	errors := make(chan error, 12)
	start := make(chan struct{})
	for i := 0; i < 12; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			<-start
			errors <- repo.Create(&model.GalleryImage{ID: uuid.New(), URL: "/photo.png"})
		}()
	}
	close(start)
	workers.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
	var items []model.GalleryImage
	if err := db.Order("sort_order ASC").Find(&items).Error; err != nil {
		t.Fatal(err)
	}
	if len(items) != 12 {
		t.Fatalf("lost gallery entries: %d", len(items))
	}
	for i, item := range items {
		if item.SortOrder != i+1 {
			t.Fatalf("duplicate/missing sort order: position %d has %d", i+1, item.SortOrder)
		}
	}
}
