package main

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/testutil"
)

func TestBackgroundWriteChecksRoleAfterAcquiringLease(t *testing.T) {
	db := testutil.Database(t, &model.SiteConfig{})
	repo := repository.NewSiteConfigRepo(db)
	for _, key := range []string{"sync_enabled", "sync_role"} {
		if err := repo.Upsert(key, "", "string"); err != nil {
			t.Fatal(err)
		}
	}
	released := false
	acquire := func(context.Context) (func(), error) {
		if err := repo.Upsert("sync_enabled", "true", "string"); err != nil {
			t.Fatal(err)
		}
		if err := repo.Upsert("sync_role", "standby", "string"); err != nil {
			t.Fatal(err)
		}
		return func() { released = true }, nil
	}
	unlock, err := backgroundWriteLease(context.Background(), repo, acquire)
	if unlock != nil || !errors.Is(err, errStandby) || !released {
		t.Fatalf("standby write allowed: unlock=%v err=%v released=%v", unlock != nil, err, released)
	}
}

func TestPeriodicWorkStopsOnShutdown(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	started := make(chan struct{})
	startPeriodic(ctx, &wg, time.Millisecond, func(ctx context.Context) {
		close(started)
		<-ctx.Done()
	})
	<-started
	cancel()
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("periodic worker retained after shutdown")
	}
}
