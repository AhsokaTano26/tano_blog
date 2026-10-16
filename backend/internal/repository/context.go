package repository

import "context"

// WithContext returns a request-scoped copy; the shared repository remains immutable.
func (r *SeriesRepo) WithContext(ctx context.Context) *SeriesRepo {
	if r == nil {
		return nil
	}
	copy := *r
	copy.db = r.db.WithContext(ctx)
	return &copy
}

// WithContext returns a request-scoped copy; the shared repository remains immutable.
func (r *NotificationRepo) WithContext(ctx context.Context) *NotificationRepo {
	if r == nil {
		return nil
	}
	copy := *r
	copy.db = r.db.WithContext(ctx)
	return &copy
}

// WithContext returns a request-scoped copy; the shared repository remains immutable.
func (r *AccessLogRepo) WithContext(ctx context.Context) *AccessLogRepo {
	if r == nil {
		return nil
	}
	copy := *r
	copy.db = r.db.WithContext(ctx)
	return &copy
}

// WithContext returns a request-scoped copy; the shared repository remains immutable.
func (r *PostRepo) WithContext(ctx context.Context) *PostRepo {
	if r == nil {
		return nil
	}
	copy := *r
	copy.db = r.db.WithContext(ctx)
	return &copy
}

// WithContext returns a request-scoped copy; the shared repository remains immutable.
func (r *CategoryRepo) WithContext(ctx context.Context) *CategoryRepo {
	if r == nil {
		return nil
	}
	copy := *r
	copy.db = r.db.WithContext(ctx)
	return &copy
}

// WithContext returns a request-scoped copy; the shared repository remains immutable.
func (r *TagRepo) WithContext(ctx context.Context) *TagRepo {
	if r == nil {
		return nil
	}
	copy := *r
	copy.db = r.db.WithContext(ctx)
	return &copy
}

// WithContext returns a request-scoped copy; the shared repository remains immutable.
func (r *CommentRepo) WithContext(ctx context.Context) *CommentRepo {
	if r == nil {
		return nil
	}
	copy := *r
	copy.db = r.db.WithContext(ctx)
	return &copy
}

// WithContext returns a request-scoped copy; the shared repository remains immutable.
func (r *MediaRepo) WithContext(ctx context.Context) *MediaRepo {
	if r == nil {
		return nil
	}
	copy := *r
	copy.db = r.db.WithContext(ctx)
	return &copy
}

// WithContext returns a request-scoped copy; the shared repository remains immutable.
func (r *SiteConfigRepo) WithContext(ctx context.Context) *SiteConfigRepo {
	if r == nil {
		return nil
	}
	copy := *r
	copy.db = r.db.WithContext(ctx)
	return &copy
}

// WithContext returns a request-scoped copy; the shared repository remains immutable.
func (r *IPBanRepo) WithContext(ctx context.Context) *IPBanRepo {
	if r == nil {
		return nil
	}
	copy := *r
	copy.db = r.db.WithContext(ctx)
	return &copy
}

// WithContext returns a request-scoped copy; the shared repository remains immutable.
func (r *GalleryRepo) WithContext(ctx context.Context) *GalleryRepo {
	if r == nil {
		return nil
	}
	copy := *r
	copy.db = r.db.WithContext(ctx)
	return &copy
}
