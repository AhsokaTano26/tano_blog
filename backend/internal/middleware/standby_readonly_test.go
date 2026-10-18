package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/service"
	"tano_blog/backend/internal/testutil"
)

func TestStandbyRoleIsCheckedAfterWaitingForWriteLease(t *testing.T) {
	db := testutil.Database(t, &model.SiteConfig{})
	repo := repository.NewSiteConfigRepo(db)
	if err := repo.Upsert("sync_enabled", "true", "string"); err != nil {
		t.Fatal(err)
	}
	if err := repo.Upsert("sync_role", "primary", "string"); err != nil {
		t.Fatal(err)
	}
	replication := &service.ReplicationService{}
	release, err := replication.AcquireBackupGate(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	entered := make(chan struct{})
	acquire := func(ctx context.Context) (func(), error) {
		close(entered)
		return replication.AcquireWriteLeaseContext(ctx)
	}
	router := gin.New()
	router.Use(StandbyReadOnly(repo, replication.AcquireWriteLease, acquire))
	router.POST("/write", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	done := make(chan int, 1)
	go func() {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest("POST", "/write", nil))
		done <- w.Code
	}()
	<-entered
	if err := repo.Upsert("sync_role", "standby", "string"); err != nil {
		t.Fatal(err)
	}
	release()
	select {
	case code := <-done:
		if code != http.StatusServiceUnavailable {
			t.Fatalf("writer ignored role change while waiting: %d", code)
		}
	case <-time.After(time.Second):
		t.Fatal("write gate did not release")
	}
}

func TestCancelledWriteDoesNotWaitForRestore(t *testing.T) {
	db := testutil.Database(t, &model.SiteConfig{})
	replication := &service.ReplicationService{}
	release, err := replication.AcquireBackupGate(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	router := gin.New()
	router.Use(StandbyReadOnly(repository.NewSiteConfigRepo(db), replication.AcquireWriteLease, replication.AcquireWriteLeaseContext))
	router.POST("/write", func(c *gin.Context) { t.Error("cancelled handler ran") })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	done := make(chan int, 1)
	go func() {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest("POST", "/write", nil).WithContext(ctx))
		done <- w.Code
	}()
	select {
	case code := <-done:
		if code != http.StatusRequestTimeout {
			t.Fatalf("cancelled wait returned %d", code)
		}
	case <-time.After(time.Second):
		t.Fatal("cancelled request kept waiting")
	}
}

func TestWriteFailsClosedWhenStandbyRoleCannotBeRead(t *testing.T) {
	db := testutil.Database(t, &model.SiteConfig{})
	repo := repository.NewSiteConfigRepo(db)
	if err := repo.Upsert("sync_enabled", "true", "string"); err != nil {
		t.Fatal(err)
	}
	if err := repo.Upsert("sync_role", "standby", "string"); err != nil {
		t.Fatal(err)
	}
	released, wrote := false, false
	acquire := func(context.Context) (func(), error) {
		// A real database failure after acquiring the write lease must not turn
		// a standby into a writable server (uploads can mutate files without SQL).
		if err := db.Exec("DROP TABLE site_configs").Error; err != nil {
			t.Fatal(err)
		}
		return func() { released = true }, nil
	}
	router := gin.New()
	router.Use(StandbyReadOnly(repo, nil, acquire))
	router.POST("/write", func(c *gin.Context) {
		wrote = true
		c.Status(http.StatusNoContent)
	})
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest("POST", "/write", nil))
	if w.Code != http.StatusServiceUnavailable || wrote || !released {
		t.Fatalf("role read failure admitted write: status=%d wrote=%v released=%v", w.Code, wrote, released)
	}
}

func TestClearAllBypassesSharedLeaseForItsExclusiveGate(t *testing.T) {
	db := testutil.Database(t, &model.SiteConfig{})
	sharedLease := false
	router := gin.New()
	router.Use(StandbyReadOnly(repository.NewSiteConfigRepo(db), nil, func(context.Context) (func(), error) {
		sharedLease = true
		return nil, context.Canceled
	}))
	router.POST("/api/v1/admin/restore/clear-all", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/admin/restore/clear-all", nil))
	if w.Code != http.StatusNoContent || sharedLease {
		t.Fatalf("clear-all acquired shared lease before its exclusive gate: status=%d shared=%v", w.Code, sharedLease)
	}
}
