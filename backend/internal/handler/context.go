package handler

import "context"

func (h *FriendLinkHandler) withContext(ctx context.Context) *FriendLinkHandler {
	copy := *h
	copy.db = h.db.WithContext(ctx)
	return &copy
}

func (h *CommentHandler) withContext(ctx context.Context) *CommentHandler {
	copy := *h
	copy.repo = h.repo.WithContext(ctx)
	copy.db = h.db.WithContext(ctx)
	return &copy
}

func (h *MediaHandler) withContext(ctx context.Context) *MediaHandler {
	copy := *h
	copy.repo = h.repo.WithContext(ctx)
	copy.galleryRepo = h.galleryRepo.WithContext(ctx)
	return &copy
}

func (h *AuthHandler) withContext(ctx context.Context) *AuthHandler {
	copy := *h
	copy.db = h.db.WithContext(ctx)
	return &copy
}

func (h *PostHandler) withContext(ctx context.Context) *PostHandler {
	copy := *h
	copy.repo = h.repo.WithContext(ctx)
	return &copy
}

func (h *FeedHandler) withContext(ctx context.Context) *FeedHandler {
	copy := *h
	copy.db = h.db.WithContext(ctx)
	return &copy
}

func (h *SeriesHandler) withContext(ctx context.Context) *SeriesHandler {
	copy := *h
	copy.repo = h.repo.WithContext(ctx)
	return &copy
}

func (h *AIHandler) withContext(ctx context.Context) *AIHandler {
	copy := *h
	copy.db = h.db.WithContext(ctx)
	copy.aiService = h.aiService.WithContext(ctx)
	return &copy
}

func (h *NotificationHandler) withContext(ctx context.Context) *NotificationHandler {
	copy := *h
	copy.repo = h.repo.WithContext(ctx)
	return &copy
}

func (h *CategoryHandler) withContext(ctx context.Context) *CategoryHandler {
	copy := *h
	copy.db = h.db.WithContext(ctx)
	return &copy
}

func (h *TagHandler) withContext(ctx context.Context) *TagHandler {
	copy := *h
	copy.db = h.db.WithContext(ctx)
	return &copy
}

func (h *IPBanHandler) withContext(ctx context.Context) *IPBanHandler {
	copy := *h
	copy.repo = h.repo.WithContext(ctx)
	copy.configRepo = h.configRepo.WithContext(ctx)
	return &copy
}

func (h *NavLinkHandler) withContext(ctx context.Context) *NavLinkHandler {
	copy := *h
	copy.db = h.db.WithContext(ctx)
	return &copy
}

func (h *GalleryHandler) withContext(ctx context.Context) *GalleryHandler {
	copy := *h
	copy.repo = h.repo.WithContext(ctx)
	return &copy
}

func (h *SiteConfigHandler) withContext(ctx context.Context) *SiteConfigHandler {
	copy := *h
	copy.repo = h.repo.WithContext(ctx)
	copy.db = h.db.WithContext(ctx)
	return &copy
}

func (h *AccessLogHandler) withContext(ctx context.Context) *AccessLogHandler {
	copy := *h
	copy.repo = h.repo.WithContext(ctx)
	return &copy
}
