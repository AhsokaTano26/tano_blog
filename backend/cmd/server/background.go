package main

import (
	"context"
	"errors"
	"sync"
	"time"

	"tano_blog/backend/internal/repository"
)

var errStandby = errors.New("background writes are disabled on a standby")

func backgroundWriteLease(ctx context.Context, repo *repository.SiteConfigRepo, acquire func(context.Context) (func(), error)) (func(), error) {
	release, err := acquire(ctx)
	if err != nil {
		return nil, err
	}
	settings, err := repo.WithContext(ctx).GetByKeys([]string{"sync_enabled", "sync_role"})
	if err != nil {
		release()
		return nil, err
	}
	values := make(map[string]string, len(settings))
	for _, setting := range settings {
		values[setting.Key] = setting.Value
	}
	if values["sync_enabled"] == "true" && values["sync_role"] == "standby" {
		release()
		return nil, errStandby
	}
	return release, nil
}

func startPeriodic(ctx context.Context, wg *sync.WaitGroup, interval time.Duration, run func(context.Context)) {
	wg.Add(1)
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if ctx.Err() != nil {
					return
				}
				run(ctx)
			}
		}
	}()
}
