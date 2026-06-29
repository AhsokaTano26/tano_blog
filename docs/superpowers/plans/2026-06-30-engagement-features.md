# 博客互动增强功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在博客中新增 7 个互动功能：文章系列/合集、评论表情反应、评论实时预览、Spam 筛选标签、标签云、猜你喜欢、上一篇/下一篇导航

**Architecture:** 后端 Go + Gin + GORM，前端 React + Next.js 14 (App Router) + Tailwind CSS。每个功能作为独立任务实现，先后端后前端。

**Tech Stack:** Go 1.22+, Gin v1.12.0, GORM v1.31.2, PostgreSQL 16, Next.js 14, Tailwind CSS, react-markdown, remark-gfm

---

## 文件结构总览

| 模块 | 新建文件 | 修改文件 |
|------|----------|----------|
| 文章系列 | `backend/internal/handler/series.go`, `backend/internal/repository/series.go` | `backend/internal/model/models.go`, `backend/cmd/server/main.go`, `frontend/src/lib/api.ts`, `frontend/src/app/admin/posts/page.tsx`, `frontend/src/app/posts/[slug]/page.tsx` |
| 表情反应 | - | `backend/internal/model/models.go`, `backend/internal/handler/comment.go`, `backend/internal/repository/repositories.go`, `backend/cmd/server/main.go`, `frontend/src/lib/api.ts`, `frontend/src/app/posts/[slug]/page.tsx` |
| 评论预览 | - | `frontend/src/app/posts/[slug]/page.tsx` |
| Spam 筛选 | - | `frontend/src/app/admin/comments/page.tsx` |
| 标签云 | `frontend/src/components/TagCloud.tsx` | `backend/internal/repository/repositories.go`, `backend/internal/handler/category_tag.go`, `frontend/src/components/Header.tsx` |
| 猜你喜欢 | - | `backend/internal/repository/repositories.go`, `backend/internal/handler/post.go`, `backend/cmd/server/main.go`, `frontend/src/lib/api.ts`, `frontend/src/app/posts/[slug]/page.tsx` |
| 上一篇/下一篇 | - | `backend/internal/repository/repositories.go`, `backend/internal/handler/post.go`, `backend/cmd/server/main.go`, `frontend/src/app/posts/[slug]/page.tsx` |

---

### Task 1: 数据模型 — 新增 Series + CommentReaction 表

**Files:**
- Modify: `backend/internal/model/models.go`

**Interfaces:**
- Produces: `model.Series`, `model.PostSeries`, `model.CommentReaction` 结构体定义

- [ ] **Step 1: 在 models.go 中添加 Series 结构体**

在 `type PostRevision struct { ... }` 之后、`AutoMigrate` 之前添加：

```go
type Series struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name        string     `gorm:"size:200;not null" json:"name"`
	Slug        string     `gorm:"uniqueIndex;size:200;not null" json:"slug"`
	Description string     `gorm:"type:text" json:"description"`
	CoverImage  string     `gorm:"size:500" json:"cover_image"`
	SortOrder   int        `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	Posts       []Post     `gorm:"many2many:post_series;" json:"-"`
}

type PostSeries struct {
	SeriesID  uuid.UUID `gorm:"type:uuid;primaryKey" json:"series_id"`
	PostID    uuid.UUID `gorm:"type:uuid;primaryKey" json:"post_id"`
	SortOrder int       `gorm:"default:0" json:"sort_order"`
}

func (PostSeries) TableName() string {
	return "post_series"
}
```

- [ ] **Step 2: 在 models.go 中添加 CommentReaction 结构体**

在 `PostSeries` 之后添加：

```go
type CommentReaction struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CommentID uuid.UUID `gorm:"type:uuid;index;not null" json:"comment_id"`
	Emoji     string    `gorm:"size:10;not null" json:"emoji"`
	IPAddress string    `gorm:"size:45;not null" json:"ip_address"`
	CreatedAt time.Time `json:"created_at"`
}
```

唯一索引使用 GORM 的 unique index 约束。

- [ ] **Step 3: 给 Post 模型添加 Series 字段**

在 `Post` 结构体的 `Tags` 字段后添加：

```go
Series []Series `gorm:"many2many:post_series;" json:"series,omitempty"`
```

- [ ] **Step 4: 在 AutoMigrate 中添加新表**

将 `&Series{}`, `&PostSeries{}`, `&CommentReaction{}` 添加到 `AutoMigrate` 的调用中：

```go
func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&User{},
		&Passkey{},
		&Category{},
		&Tag{},
		&Post{},
		&PostTag{},
		&Comment{},
		&Media{},
		&MediaTag{},
		&SiteConfig{},
		&AccessLog{},
		&PostRevision{},
		&Series{},           // new
		&PostSeries{},       // new
		&CommentReaction{},  // new
	)
}
```

- [ ] **Step 5: 验证编译**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/backend && go build ./...
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog && git add backend/internal/model/models.go && git commit -m "feat: add Series, PostSeries, CommentReaction models"
```

---

### Task 2: 文章系列 — Repository + Handler

**Files:**
- Create: `backend/internal/repository/series.go`
- Create: `backend/internal/handler/series.go`
- Modify: `backend/cmd/server/main.go`

**Interfaces:**
- Consumes: `model.Series`, `model.PostSeries`
- Produces: `SeriesRepo` (Create, List, GetByID, GetBySlug, Update, Delete, ListPosts, SetPosts, ListWithCount), `SeriesHandler` (7 handler methods)

- [ ] **Step 1: 创建 SeriesRepo**

`backend/internal/repository/series.go`:

```go
package repository

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
)

type SeriesRepo struct {
	db *gorm.DB
}

func NewSeriesRepo(db *gorm.DB) *SeriesRepo {
	return &SeriesRepo{db: db}
}

func (r *SeriesRepo) List() ([]model.Series, error) {
	var series []model.Series
	err := r.db.Order("sort_order ASC, created_at DESC").Find(&series).Error
	return series, err
}

func (r *SeriesRepo) ListWithCount() ([]map[string]interface{}, error) {
	var results []map[string]interface{}
	err := r.db.Model(&model.Series{}).
		Select("series.*, COUNT(post_series.post_id) as post_count").
		Joins("LEFT JOIN post_series ON post_series.series_id = series.id").
		Group("series.id").
		Order("series.sort_order ASC, series.created_at DESC").
		Find(&results).Error
	return results, err
}

func (r *SeriesRepo) GetByID(id uuid.UUID) (*model.Series, error) {
	var s model.Series
	err := r.db.First(&s, id).Error
	return &s, err
}

func (r *SeriesRepo) GetBySlug(slug string) (*model.Series, error) {
	var s model.Series
	err := r.db.Where("slug = ?", slug).Preload("Posts", "status = ?", "published").
		Preload("Posts.Category").Preload("Posts.Tags").
		First(&s).Error
	return &s, err
}

func (r *SeriesRepo) Create(s *model.Series) error {
	return r.db.Create(s).Error
}

func (r *SeriesRepo) Update(id uuid.UUID, updates map[string]interface{}) error {
	return r.db.Model(&model.Series{}).Where("id = ?", id).Updates(updates).Error
}

func (r *SeriesRepo) Delete(id uuid.UUID) error {
	r.db.Where("series_id = ?", id).Delete(&model.PostSeries{})
	return r.db.Delete(&model.Series{}, id).Error
}

func (r *SeriesRepo) ListPosts(seriesID uuid.UUID) ([]model.Post, error) {
	var posts []model.Post
	err := r.db.Joins("JOIN post_series ON post_series.post_id = posts.id").
		Where("post_series.series_id = ?", seriesID).
		Preload("Category").Preload("Tags").
		Order("post_series.sort_order ASC, posts.published_at DESC").
		Find(&posts).Error
	return posts, err
}

func (r *SeriesRepo) SetPosts(seriesID uuid.UUID, postIDs []uuid.UUID) error {
	tx := r.db.Begin()
	tx.Where("series_id = ?", seriesID).Delete(&model.PostSeries{})
	for i, pid := range postIDs {
		tx.Create(&model.PostSeries{SeriesID: seriesID, PostID: pid, SortOrder: i})
	}
	return tx.Commit().Error
}
```

- [ ] **Step 2: 创建 SeriesHandler**

`backend/internal/handler/series.go`:

```go
package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/middleware"
	"gorm.io/gorm"
)

type SeriesHandler struct {
	repo *repository.SeriesRepo
}

func NewSeriesHandler(repo *repository.SeriesRepo) *SeriesHandler {
	return &SeriesHandler{repo: repo}
}

// List public — returns series list with post count
func (h *SeriesHandler) List(c *gin.Context) {
	series, err := h.repo.ListWithCount()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取系列列表失败"})
		return
	}
	if series == nil {
		series = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"items": series})
}

// GetBySlug public — returns series detail with posts
func (h *SeriesHandler) GetBySlug(c *gin.Context) {
	slug := c.Param("slug")
	s, err := h.repo.GetBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "系列不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"series": s})
}

// AdminList — admin series list
func (h *SeriesHandler) AdminList(c *gin.Context) {
	series, err := h.repo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取系列列表失败"})
		return
	}
	if series == nil {
		series = []model.Series{}
	}
	c.JSON(http.StatusOK, gin.H{"items": series})
}

// AdminCreate — create series
func (h *SeriesHandler) AdminCreate(c *gin.Context) {
	var input struct {
		Name        string `json:"name" binding:"required"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
		CoverImage  string `json:"cover_image"`
		SortOrder   int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	slug := input.Slug
	if slug == "" {
		slug = uuid.New().String()[:8]
	}

	s := &model.Series{
		ID:          uuid.New(),
		Name:        input.Name,
		Slug:        slug,
		Description: input.Description,
		CoverImage:  input.CoverImage,
		SortOrder:   input.SortOrder,
	}
	if err := h.repo.Create(s); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建系列失败"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"series": s})
}

// AdminUpdate — update series
func (h *SeriesHandler) AdminUpdate(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var input struct {
		Name        string `json:"name"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
		CoverImage  string `json:"cover_image"`
		SortOrder   *int   `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	updates := map[string]interface{}{}
	if input.Name != "" {
		updates["name"] = input.Name
	}
	if input.Slug != "" {
		updates["slug"] = input.Slug
	}
	updates["description"] = input.Description
	updates["cover_image"] = input.CoverImage
	if input.SortOrder != nil {
		updates["sort_order"] = *input.SortOrder
	}

	if err := h.repo.Update(id, updates); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新系列失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}

// AdminDelete — delete series
func (h *SeriesHandler) AdminDelete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.repo.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除系列失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

// AdminListPosts — list posts in series (for admin)
func (h *SeriesHandler) AdminListPosts(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	posts, err := h.repo.ListPosts(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "系列不存在"})
		return
	}
	if posts == nil {
		posts = []model.Post{}
	}
	c.JSON(http.StatusOK, gin.H{"items": posts})
}

// AdminSetPosts — batch set posts in series with sort order
func (h *SeriesHandler) AdminSetPosts(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var input struct {
		PostIDs []string `json:"post_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	postIDs := make([]uuid.UUID, 0, len(input.PostIDs))
	for _, pid := range input.PostIDs {
		if parsed, err := uuid.Parse(pid); err == nil {
			postIDs = append(postIDs, parsed)
		}
	}

	if err := h.repo.SetPosts(id, postIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新系列文章失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}
```

- [ ] **Step 3: 在 main.go 中注册系列路由**

在 `// Initialize repositories` 区域添加：
```go
seriesRepo := repository.NewSeriesRepo(db)
```

在 `// Initialize handlers` 区域添加：
```go
seriesHandler := handler.NewSeriesHandler(seriesRepo)
```

在公开路由区域（`api.GET("/tags/:slug", ...)` 之后，评论路由之前）添加：
```go
api.GET("/series", seriesHandler.List)
api.GET("/series/:slug", seriesHandler.GetBySlug)
```

在 admin 路由块中（`admin.DELETE("/media/tags/:id", ...)` 之后，config 之前）添加：
```go
admin.GET("/series", seriesHandler.AdminList)
admin.POST("/series", seriesHandler.AdminCreate)
admin.PUT("/series/:id", seriesHandler.AdminUpdate)
admin.DELETE("/series/:id", seriesHandler.AdminDelete)
admin.GET("/series/:id/posts", seriesHandler.AdminListPosts)
admin.PUT("/series/:id/posts", seriesHandler.AdminSetPosts)
```

- [ ] **Step 4: 验证编译**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/backend && go build ./...
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog && git add backend/internal/handler/series.go backend/internal/repository/series.go backend/cmd/server/main.go && git commit -m "feat: add series CRUD API (admin + public)"
```

---

### Task 3: 上一篇/下一篇 + 猜你喜欢 — 后端

**Files:**
- Modify: `backend/internal/repository/repositories.go`
- Modify: `backend/internal/handler/post.go`
- Modify: `backend/cmd/server/main.go`

**Interfaces:**
- Consumes: `model.Post` (existing)
- Produces: `PostRepo.AdjacentPosts(slug)`, `PostRepo.RelatedPosts(slug, limit)`, `PostHandler.AdjacentPosts`, `PostHandler.RelatedPosts`

- [ ] **Step 1: 在 PostRepo 中添加 AdjacentPosts 方法**

在 `backend/internal/repository/repositories.go` 中，在 `TopViewed` 方法之后添加：

```go
func (r *PostRepo) AdjacentPosts(slug string) (prev, next *model.Post) {
	var current model.Post
	if err := r.db.Where("slug = ? AND status = ?", slug, "published").First(&current).Error; err != nil {
		return nil, nil
	}

	var prevPost model.Post
	if err := r.db.Where("published_at < ? AND status = ?", current.PublishedAt, "published").
		Order("published_at DESC").Limit(1).First(&prevPost).Error; err == nil {
		prev = &prevPost
	}

	var nextPost model.Post
	if err := r.db.Where("published_at > ? AND status = ?", current.PublishedAt, "published").
		Order("published_at ASC").Limit(1).First(&nextPost).Error; err == nil {
		next = &nextPost
	}

	return
}
```

- [ ] **Step 2: 在 PostRepo 中添加 RelatedPosts 方法**

在 `AdjacentPosts` 之后添加：

```go
func (r *PostRepo) RelatedPosts(slug string, limit int) ([]model.Post, error) {
	var current model.Post
	if err := r.db.Where("slug = ? AND status = ?", slug, "published").First(&current).Error; err != nil {
		return nil, err
	}

	// Get tag IDs of current post
	var tagIDs []uuid.UUID
	r.db.Table("post_tags").Where("post_id = ?", current.ID).Pluck("tag_id", &tagIDs)

	if len(tagIDs) == 0 {
		return nil, nil
	}

	// Find posts sharing tags, ordered by match count
	var posts []model.Post
	err := r.db.Where("posts.id != ? AND posts.status = ?", current.ID, "published").
		Joins("JOIN post_tags ON post_tags.post_id = posts.id").
		Where("post_tags.tag_id IN ?", tagIDs).
		Group("posts.id").
		Order("COUNT(post_tags.tag_id) DESC, posts.published_at DESC").
		Limit(limit).
		Preload("Category").Preload("Tags").
		Find(&posts).Error

	return posts, err
}
```

- [ ] **Step 3: 在 PostHandler 中添加 AdjacentPosts handler**

在 `backend/internal/handler/post.go` 的 `TopViewed` handler 之后添加：

```go
func (h *PostHandler) AdjacentPosts(c *gin.Context) {
	slug := c.Param("slug")
	prev, next := h.repo.AdjacentPosts(slug)

	type adjacentItem struct {
		Slug  string `json:"slug"`
		Title string `json:"title"`
	}

	var prevResp, nextResp *adjacentItem
	if prev != nil {
		prevResp = &adjacentItem{Slug: prev.Slug, Title: prev.Title}
	}
	if next != nil {
		nextResp = &adjacentItem{Slug: next.Slug, Title: next.Title}
	}

	c.JSON(http.StatusOK, gin.H{
		"prev": prevResp,
		"next": nextResp,
	})
}
```

- [ ] **Step 4: 在 PostHandler 中添加 RelatedPosts handler**

在 `AdjacentPosts` handler 之后添加：

```go
func (h *PostHandler) RelatedPosts(c *gin.Context) {
	slug := c.Param("slug")
	posts, err := h.repo.RelatedPosts(slug, 6)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取相关文章失败"})
		return
	}
	if posts == nil {
		posts = []model.Post{}
	}
	c.JSON(http.StatusOK, gin.H{"items": posts})
}
```

注意需要在文件头部 import 中添加 `"tano_blog/backend/internal/model"`（如果尚未导入）。

- [ ] **Step 5: 在 main.go 中注册路由**

在 `api.GET("/posts/top-viewed", ...)` 之后添加：
```go
api.GET("/posts/:slug/adjacent", postHandler.AdjacentPosts)
api.GET("/posts/:slug/related", postHandler.RelatedPosts)
```

- [ ] **Step 6: 验证编译**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/backend && go build ./...
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog && git add backend/internal/repository/repositories.go backend/internal/handler/post.go backend/cmd/server/main.go && git commit -m "feat: add adjacent posts and related posts API"
```

---

### Task 4: 标签云 — 后端 post_count

**Files:**
- Modify: `backend/internal/repository/repositories.go`
- Modify: `backend/internal/handler/category_tag.go`

**Interfaces:**
- Consumes: `model.Tag` (existing)
- Produces: `TagRepo.PostCounts()` or TagHandler.List returns extended data

TagHandler 目前直接使用 db，我们也直接在 handler 中修改 List 方法。

- [ ] **Step 1: 给 TagHandler.List 添加 post_count**

修改 `backend/internal/handler/category_tag.go` 中的 `TagHandler.List` 方法：

```go
func (h *TagHandler) List(c *gin.Context) {
	type TagWithCount struct {
		model.Tag
		PostCount int `json:"post_count"`
	}
	var tags []TagWithCount
	h.db.Model(&model.Tag{}).
		Select("tags.*, COUNT(post_tags.post_id) as post_count").
		Joins("LEFT JOIN post_tags ON post_tags.tag_id = tags.id").
		Group("tags.id").
		Order("name ASC").
		Scan(&tags)
	if tags == nil {
		tags = []TagWithCount{}
	}
	c.JSON(http.StatusOK, gin.H{"items": tags})
}
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/backend && go build ./...
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog && git add backend/internal/handler/category_tag.go && git commit -m "feat: add post_count to tags API for tag cloud"
```

---

### Task 5: 评论表情反应 — 后端

**Files:**
- Modify: `backend/internal/handler/comment.go`
- Modify: `backend/internal/repository/repositories.go`
- Modify: `backend/cmd/server/main.go`

**Interfaces:**
- Consumes: `model.CommentReaction`
- Produces: `CommentRepo.ToggleReaction`, `CommentRepo.GetReactions`, `CommentHandler.ToggleReaction`

- [ ] **Step 1: 在 CommentRepo 中添加反应方法**

在 `backend/internal/repository/repositories.go` 的 `CommentRepo` 中添加：

```go
func (r *CommentRepo) ToggleReaction(commentID uuid.UUID, emoji, ipAddress string) (bool, error) {
	var existing model.CommentReaction
	result := r.db.Where("comment_id = ? AND emoji = ? AND ip_address = ?", commentID, emoji, ipAddress).First(&existing)
	if result.Error == nil {
		// Already exists — remove (toggle off)
		if err := r.db.Delete(&existing).Error; err != nil {
			return false, err
		}
		return false, nil
	}

	// Not exists — create (toggle on)
	reaction := &model.CommentReaction{
		ID:        uuid.New(),
		CommentID: commentID,
		Emoji:     emoji,
		IPAddress: ipAddress,
	}
	if err := r.db.Create(reaction).Error; err != nil {
		return false, err
	}
	return true, nil
}

func (r *CommentRepo) GetReactions(commentIDs []uuid.UUID) (map[string]map[string]int, error) {
	type ReactionCount struct {
		CommentID uuid.UUID
		Emoji     string
		Count     int
	}
	var rows []ReactionCount
	r.db.Model(&model.CommentReaction{}).
		Select("comment_id, emoji, COUNT(*) as count").
		Where("comment_id IN ?", commentIDs).
		Group("comment_id, emoji").
		Scan(&rows)

	result := make(map[string]map[string]int)
	for _, row := range rows {
		cid := row.CommentID.String()
		if result[cid] == nil {
			result[cid] = make(map[string]int)
		}
		result[cid][row.Emoji] = row.Count
	}
	return result, nil
}

func (r *CommentRepo) GetUserReactions(commentIDs []uuid.UUID, ipAddress string) (map[string][]string, error) {
	type UserReaction struct {
		CommentID uuid.UUID
		Emoji     string
	}
	var rows []UserReaction
	r.db.Model(&model.CommentReaction{}).
		Select("comment_id, emoji").
		Where("comment_id IN ? AND ip_address = ?", commentIDs, ipAddress).
		Find(&rows)

	result := make(map[string][]string)
	for _, row := range rows {
		cid := row.CommentID.String()
		result[cid] = append(result[cid], row.Emoji)
	}
	return result, nil
}
```

需要在文件头部添加 import：`"tano_blog/backend/internal/model"`（如果尚未导入）。

- [ ] **Step 2: 在 CommentHandler 中添加 ToggleReaction handler**

在 `backend/internal/handler/comment.go` 的 `Delete` 方法之后（文件末尾）添加：

```go
func (h *CommentHandler) ToggleReaction(c *gin.Context) {
	commentID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	// Verify comment exists
	var comment model.Comment
	if err := h.db.First(&comment, commentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "评论不存在"})
		return
	}

	var input struct {
		Emoji string `json:"emoji" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	// Validate emoji is in preset list
	validEmojis := map[string]bool{"👍": true, "❤️": true, "😂": true, "😮": true, "😢": true, "🙏": true}
	if !validEmojis[input.Emoji] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的表情"})
		return
	}

	ipAddress := c.ClientIP()
	active, err := h.repo.ToggleReaction(commentID, input.Emoji, ipAddress)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"active": active, "emoji": input.Emoji})
}
```

- [ ] **Step 3: 修改 ListByPost 返回 reactions 数据**

修改 `CommentHandler.ListByPost` 中的 `publicComment` 结构体，添加 reactions 字段：

```go
type publicComment struct {
	ID        uuid.UUID              `json:"id"`
	PostID    uuid.UUID              `json:"post_id"`
	ParentID  *uuid.UUID             `json:"parent_id"`
	Nickname  string                 `json:"nickname"`
	Website   string                 `json:"website"`
	Content   string                 `json:"content"`
	Status    string                 `json:"status"`
	Country   string                 `json:"country"`
	City      string                 `json:"city"`
	CreatedAt string                 `json:"created_at"`
	Children  []publicComment        `json:"children,omitempty"`
	Reactions map[string]int         `json:"reactions"`
	UserEmojis []string              `json:"user_emojis,omitempty"`
}
```

修改 `convert` 函数（先收集所有 comment IDs，批量查询 reactions）：

```go
func (h *CommentHandler) ListByPost(c *gin.Context) {
	slug := c.Param("slug")
	post, err := h.lookupPostBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}

	comments, err := h.repo.ListByPost(post.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取评论失败"})
		return
	}

	// Collect all comment IDs for batch reaction query
	var allCommentIDs []uuid.UUID
	var collectIDs func(c model.Comment)
	collectIDs = func(c model.Comment) {
		allCommentIDs = append(allCommentIDs, c.ID)
		for _, child := range c.Children {
			collectIDs(child)
		}
	}
	for _, c := range comments {
		collectIDs(c)
	}

	// Get reaction counts
	reactions, _ := h.repo.GetReactions(allCommentIDs)
	// Get current user's reactions
	ipAddress := c.ClientIP()
	userReactions, _ := h.repo.GetUserReactions(allCommentIDs, ipAddress)

	type publicComment struct {
		ID         uuid.UUID       `json:"id"`
		PostID     uuid.UUID       `json:"post_id"`
		ParentID   *uuid.UUID      `json:"parent_id"`
		Nickname   string          `json:"nickname"`
		Website    string          `json:"website"`
		Content    string          `json:"content"`
		Status     string          `json:"status"`
		Country    string          `json:"country"`
		City       string          `json:"city"`
		CreatedAt  string          `json:"created_at"`
		Children   []publicComment `json:"children,omitempty"`
		Reactions  map[string]int  `json:"reactions"`
		UserEmojis []string        `json:"user_emojis,omitempty"`
	}

	var convert func(c model.Comment) publicComment
	convert = func(c model.Comment) publicComment {
		pc := publicComment{
			ID:         c.ID,
			PostID:     c.PostID,
			ParentID:   c.ParentID,
			Nickname:   c.Nickname,
			Website:    c.Website,
			Content:    c.Content,
			Status:     c.Status,
			Country:    c.Country,
			City:       c.City,
			CreatedAt:  c.CreatedAt.Format("2006-01-02T15:04:05Z"),
			Reactions:  reactions[c.ID.String()],
			UserEmojis: userReactions[c.ID.String()],
		}
		if pc.Reactions == nil {
			pc.Reactions = map[string]int{}
		}
		if pc.UserEmojis == nil {
			pc.UserEmojis = []string{}
		}
		for _, child := range c.Children {
			pc.Children = append(pc.Children, convert(child))
		}
		return pc
	}

	result := make([]publicComment, len(comments))
	for i, c := range comments {
		result[i] = convert(c)
	}

	c.JSON(http.StatusOK, gin.H{"items": result})
}
```

- [ ] **Step 4: 在 main.go 中注册反应路由**

在 `api.POST("/posts/:slug/comments", ...)` 之后添加：
```go
api.POST("/posts/:slug/comments/:id/reactions", commentHandler.ToggleReaction)
```

- [ ] **Step 5: 验证编译**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/backend && go build ./...
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog && git add backend/internal/handler/comment.go backend/internal/repository/repositories.go backend/cmd/server/main.go && git commit -m "feat: add comment emoji reactions API"
```

---

### Task 6: 前端 API 扩展

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: 添加新 API 方法**

在 `getComments` / `createComment` 之后添加：

```typescript
  // Comments reactions
  toggleReaction: (slug: string, commentId: string, emoji: string) =>
    request<{ active: boolean; emoji: string }>(`/api/v1/posts/${slug}/comments/${commentId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }),

  // Series
  getSeries: () =>
    request<{ items: any[] }>('/api/v1/series'),
  getSeriesBySlug: (slug: string) =>
    request<{ series: any }>(`/api/v1/series/${slug}`),

  // Adjacent posts
  getAdjacentPosts: (slug: string) =>
    request<{ prev: { slug: string; title: string } | null; next: { slug: string; title: string } | null }>(`/api/v1/posts/${slug}/adjacent`),

  // Related posts
  getRelatedPosts: (slug: string) =>
    request<{ items: any[] }>(`/api/v1/posts/${slug}/related`),
```

在 `admin` 对象中添加：

```typescript
    series: {
      list: () => request<{ items: any[] }>('/api/v1/admin/series'),
      create: (data: any) => request('/api/v1/admin/series', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: any) => request(`/api/v1/admin/series/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) => request(`/api/v1/admin/series/${id}`, { method: 'DELETE' }),
      listPosts: (id: string) => request<{ items: any[] }>(`/api/v1/admin/series/${id}/posts`),
      setPosts: (id: string, postIds: string[]) => request(`/api/v1/admin/series/${id}/posts`, { method: 'PUT', body: JSON.stringify({ post_ids: postIds }) }),
    },
```

添加到 `config` 后的合适位置（在 `accessLogs` 之前）。

- [ ] **Step 2: 验证编译**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/frontend && npm run build 2>&1 | head -50
```

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog && git add frontend/src/lib/api.ts && git commit -m "feat: extend API client for reactions, series, adjacent/related posts"
```

---

### Task 7: 前端 — 评论表情反应 UI

**Files:**
- Modify: `frontend/src/app/posts/[slug]/page.tsx`

- [ ] **Step 1: 添加反应状态和事件处理**

在 `PostPage` 组件中，在 `const [isAdmin, setIsAdmin] = useState(false);` 之后添加：

```tsx
const [reactions, setReactions] = useState<Record<string, {counts: Record<string, number>, user: string[]}>>({});
```

预设表情常量定义在组件外部：
```tsx
const EMOJI_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
```

- [ ] **Step 2: 修改 loadComments 函数来初始化 reactions 状态**

在 `loadComments` 函数中，在 `setComments(res.items)` 之后：

```tsx
// Initialize reactions state
const reactionsMap: Record<string, {counts: Record<string, number>, user: string[]}> = {};
function extractReactions(items: any[]) {
  for (const c of items) {
    reactionsMap[c.id] = { counts: c.reactions || {}, user: c.user_emojis || [] };
    if (c.children) extractReactions(c.children);
  }
}
extractReactions(res.items);
setReactions(reactionsMap);
```

- [ ] **Step 3: 添加 toggleReaction 处理函数**

在 `handleComment` 函数之前或之后添加：

```tsx
async function handleToggleReaction(commentId: string, emoji: string) {
  try {
    const res = await api.toggleReaction(slug, commentId, emoji);
    setReactions(prev => {
      const next = { ...prev };
      const current = next[commentId] || { counts: {}, user: [] };
      const newCounts = { ...current.counts };
      const newUser = [...current.user];

      if (res.active) {
        // Add reaction
        newCounts[emoji] = (newCounts[emoji] || 0) + 1;
        if (!newUser.includes(emoji)) newUser.push(emoji);
      } else {
        // Remove reaction
        newCounts[emoji] = Math.max(0, (newCounts[emoji] || 0) - 1);
        const idx = newUser.indexOf(emoji);
        if (idx >= 0) newUser.splice(idx, 1);
        if (newCounts[emoji] === 0) delete newCounts[emoji];
      }

      next[commentId] = { counts: newCounts, user: newUser };
      return next;
    });
  } catch (e) {
    // Ignore reaction errors
  }
}
```

- [ ] **Step 4: 修改 CommentItem 添加表情栏**

在 `CommentItem` 组件中，在 `</div>`（评论内容容器关闭标签）之后、`{comment.children...}` 之前添加：

```tsx
{/* Reaction buttons */}
<div className="flex items-center gap-1 mt-2">
  {EMOJI_REACTIONS.map(emoji => {
    const commentReactions = reactions?.[comment.id];
    const count = commentReactions?.counts?.[emoji] || 0;
    const isActive = commentReactions?.user?.includes(emoji);
    return (
      <button
        key={emoji}
        onClick={() => handleToggleReaction(comment.id, emoji)}
        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-sm transition-all ${
          isActive ? 'bg-opacity-20' : 'opacity-60 hover:opacity-100'
        }`}
        style={{
          background: isActive ? 'var(--primary-sub)' : 'var(--btn-card-bg)',
          color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
        }}
      >
        <span>{emoji}</span>
        {count > 0 && <span className="text-xs font-medium">{count}</span>}
      </button>
    );
  })}
</div>
```

需要在 `CommentItem` 函数签名中添加 `reactions` 和 `onReaction` props：

```tsx
function CommentItem({ comment, depth, onReply, reactions, onReaction }: {
  comment: any;
  depth: number;
  onReply: (c: any) => void;
  reactions: Record<string, {counts: Record<string, number>, user: string[]}>;
  onReaction: (commentId: string, emoji: string) => void;
}) {
```

并更新所有 `CommentItem` 递归调用和初始渲染调用（在 `PostPage` 中）传递这些 props。

- [ ] **Step 5: 验证编译**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/frontend && npm run build 2>&1 | head -50
```

Expected: No TypeScript errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog && git add frontend/src/app/posts/[slug]/page.tsx && git commit -m "feat: add emoji reaction UI to comments"
```

---

### Task 8: 前端 — 评论实时预览

**Files:**
- Modify: `frontend/src/app/posts/[slug]/page.tsx`

- [ ] **Step 1: 在评论表单区添加预览切换**

在评论表单的 textarea 和 submit button 之间添加。找到 textarea 元素，在它之后、`</form>` 之前插入：

```tsx
{/* Comment preview toggle */}
{commentForm.content && (
  <div>
    <button
      type="button"
      onClick={() => setShowPreview(!showPreview)}
      className="text-xs px-3 py-1 rounded-lg btn-glass transition-all mb-2"
      style={{ color: showPreview ? 'var(--primary)' : 'var(--text-secondary)' }}
    >
      {showPreview ? '关闭预览' : '预览评论'}
    </button>
    {showPreview && (
      <div className="prose dark:prose-invert prose-sm max-w-none rounded-xl p-4 overflow-y-auto"
        style={{ maxHeight: '200px', background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {commentForm.content}
        </ReactMarkdown>
      </div>
    )}
  </div>
)}
```

添加 `showPreview` 状态：
在 `const [isAdmin, setIsAdmin] = useState(false);` 旁边添加：
```tsx
const [showPreview, setShowPreview] = useState(false);
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/frontend && npm run build 2>&1 | head -50
```

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog && git add frontend/src/app/posts/[slug]/page.tsx && git commit -m "feat: add comment markdown preview"
```

---

### Task 9: 前端 — 评论管理 Spam 筛选标签

**Files:**
- Modify: `frontend/src/app/admin/comments/page.tsx`

- [ ] **Step 1: 在 tabs 中添加 "spam"**

在 `const tabs = [` 数组中添加 `spam` 标签：

```tsx
const tabs = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已批准' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'spam', label: '垃圾' },
];
```

- [ ] **Step 2: 添加 spam 状态的颜色样式**

在状态标签的 `background` 和 `color` 逻辑中增加 spam 的处理。在 `AdminComments` 组件中找到状态标签的样式三元表达式，添加 `spam` 情况：

在 `item.status === 'approved' ? ... : item.status === 'rejected' ? ... : ...` 的嵌套三元中，需要改为：

```
item.status === 'spam' ? 'hsla(280, 60%, 50%, 0.1)' : (其他)
color: item.status === 'spam' ? 'hsl(280, 60%, 50%)' : (其他)
```

这需要修改两处地方：背景颜色的三元表达式和文字颜色的三元表达式。

- [ ] **Step 3: 验证编译**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/frontend && npm run build 2>&1 | head -50
```

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog && git add frontend/src/app/admin/comments/page.tsx && git commit -m "feat: add spam filter tab to comment management"
```

---

### Task 10: 前端 — 标签云组件

**Files:**
- Create: `frontend/src/components/TagCloud.tsx`
- Modify: `frontend/src/components/Header.tsx` (或侧边栏所在文件)

- [ ] **Step 1: 创建 TagCloud 组件**

`frontend/src/components/TagCloud.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface TagItem {
  id: string;
  name: string;
  slug: string;
  post_count: number;
}

function getTagSize(count: number, minCount: number, maxCount: number): number {
  if (maxCount === minCount) return 16;
  const ratio = (count - minCount) / (maxCount - minCount);
  return 12 + ratio * 12; // 12px to 24px
}

function getTagColor(count: number, minCount: number, maxCount: number): string {
  if (maxCount === minCount) return 'var(--text-secondary)';
  const ratio = (count - minCount) / (maxCount - minCount);
  if (ratio < 0.33) return 'var(--text-info)';
  if (ratio < 0.66) return 'var(--primary)';
  return 'var(--primary)';
}

export function TagCloud() {
  const [tags, setTags] = useState<TagItem[]>([]);

  useEffect(() => {
    api.getTags().then(res => {
      setTags(res.items || []);
    }).catch(() => {});
  }, []);

  if (tags.length === 0) return null;

  const counts = tags.map(t => t.post_count || 0);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);

  return (
    <div className="glass-card rounded-2xl p-4">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
        标签云
      </h3>
      <div className="flex flex-wrap gap-2">
        {tags.map(tag => (
          <Link
            key={tag.id}
            href={`/tags/${tag.slug}`}
            className="inline-block transition-all hover:opacity-80 hover:scale-105"
            style={{
              fontSize: `${getTagSize(tag.post_count || 0, minCount, maxCount)}px`,
              color: getTagColor(tag.post_count || 0, minCount, maxCount),
            }}
          >
            {tag.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在 Header 侧边栏中集成 TagCloud**

查看 `frontend/src/components/Header.tsx` 的结构，在合适位置导入并渲染 `<TagCloud />`。

先读取 Header.tsx 确认插入位置。

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/frontend && grep -n "Tags\|tags\|Category\|category" src/components/Header.tsx | head -20
```

根据 Header 结构，在侧边栏的标签链接区域下方添加 `<TagCloud />`。

- [ ] **Step 3: 验证编译**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/frontend && npm run build 2>&1 | head -50
```

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog && git add frontend/src/components/TagCloud.tsx frontend/src/components/Header.tsx && git commit -m "feat: add tag cloud component"
```

---

### Task 11: 前端 — 上一篇/下一篇 + 猜你喜欢 (文章详情页改造)

**Files:**
- Modify: `frontend/src/app/posts/[slug]/page.tsx`

- [ ] **Step 1: 加载 adjacent posts 和 related posts 数据**

在 `PostPage` 的 `load` 函数中，并行加载 adjacent 和 related：

在 `const res = await api.getPost(slug);` 和 `setPost(res.post);` 之间/之后添加：

```tsx
// Load adjacent and related posts in parallel
api.getAdjacentPosts(slug).then(adj => {
  setAdjacentPosts(adj);
}).catch(() => {});
api.getRelatedPosts(slug).then(rel => {
  setRelatedPosts(rel.items || []);
}).catch(() => {});
```

添加状态变量（在 `const [tocItems, setTocItems] = useState<TocItem[]>([]);` 附近）：
```tsx
const [adjacentPosts, setAdjacentPosts] = useState<{ prev: any; next: any } | null>(null);
```

注意：`relatedPosts` 状态已经存在，不需要重新创建。

删除旧的分类相关文章加载（`api.getCategory(res.post.category.slug)...`）因为用 tag 匹配替代了。

- [ ] **Step 2: 添加上一篇/下一篇导航 UI**

在 CC License 区域之后、Related Posts 区域之前添加：

```tsx
{/* Adjacent Posts Navigation */}
{(adjacentPosts?.prev || adjacentPosts?.next) && (
  <div className="flex items-center justify-between gap-4 mb-6">
    <div className="flex-1">
      {adjacentPosts?.prev ? (
        <Link href={`/posts/${adjacentPosts.prev.slug}`}
          className="block glass-card rounded-2xl p-4 transition-all hover:translate-y-[-2px]">
          <div className="text-xs mb-1" style={{ color: 'var(--text-info)' }}>← 上一篇</div>
          <div className="text-sm font-medium line-clamp-1" style={{ color: 'var(--text-primary)' }}>
            {adjacentPosts.prev.title}
          </div>
        </Link>
      ) : <div />}
    </div>
    <div className="flex-1 text-right">
      {adjacentPosts?.next ? (
        <Link href={`/posts/${adjacentPosts.next.slug}`}
          className="block glass-card rounded-2xl p-4 transition-all hover:translate-y-[-2px]">
          <div className="text-xs mb-1" style={{ color: 'var(--text-info)' }}>下一篇 →</div>
          <div className="text-sm font-medium line-clamp-1" style={{ color: 'var(--text-primary)' }}>
            {adjacentPosts.next.title}
          </div>
        </Link>
      ) : <div />}
    </div>
  </div>
)}
```

- [ ] **Step 3: 改进相关文章区域**

替换现有的 Related Posts 区域为基于标签匹配的横向卡片布局：

```tsx
{/* Related Posts (tag-based) */}
{relatedPosts.length > 0 && (
  <div className="mt-10">
    <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>猜你喜欢</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {relatedPosts.slice(0, 6).map((rp: any) => (
        <Link
          key={rp.id}
          href={`/posts/${rp.slug}`}
          className="glass-card rounded-2xl overflow-hidden transition-all hover:translate-y-[-2px]"
        >
          {rp.cover_image && (
            <img src={rp.cover_image} alt={rp.title} className="w-full h-32 object-cover" />
          )}
          <div className="p-3">
            <h3 className="text-sm font-bold line-clamp-2" style={{ color: 'var(--text-primary)' }}>
              {rp.title}
            </h3>
            <div className="flex flex-wrap gap-1 mt-2">
              {rp.tags?.slice(0, 3).map((tag: any) => (
                <span key={tag.id} className="px-1.5 py-0.5 text-xs rounded"
                  style={{ background: 'var(--btn-card-bg)', color: 'var(--text-secondary)' }}>
                  #{tag.name}
                </span>
              ))}
            </div>
          </div>
        </Link>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: 验证编译**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/frontend && npm run build 2>&1 | head -50
```

Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog && git add frontend/src/app/posts/[slug]/page.tsx && git commit -m "feat: add adjacent posts nav and tag-based related posts"
```

---

### Task 12: 前端 — 文章系列管理后台 + 前台页面 + 文章编辑器集成

**Files:**
- Create: `frontend/src/app/admin/series/page.tsx`
- Create: `frontend/src/app/series/[slug]/page.tsx`
- Modify: `frontend/src/app/admin/posts/page.tsx` (编辑器)

- [ ] **Step 1: 创建系列管理页面**

`frontend/src/app/admin/series/page.tsx`：

这是一个管理后台 CRUD 页面，包含：
- 系列列表（glass-card 表格样式）
- 新建/编辑弹窗（Modal 方式）
- 设置系列内文章（多选 + 拖拽排序）

实现代码包含：
- `load()` 加载系列列表
- `handleCreate` / `handleUpdate` / `handleDelete`
- Modal 表单（name, slug, description, cover_image, sort_order）
- 文章选择弹窗（SetPostsModal）

```tsx
'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Plus, Pencil, Trash2, Bookmark } from 'lucide-react';
import { Loading } from '@/components/Loading';

export default function AdminSeries() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPosts, setShowPosts] = useState<any>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', cover_image: '', sort_order: 0 });

  async function load() {
    setLoading(true);
    try {
      const res = await api.admin.series.list();
      setItems(res.items || []);
    } catch (e) { /* empty */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditItem(null);
    setForm({ name: '', slug: '', description: '', cover_image: '', sort_order: 0 });
    setShowForm(true);
  }

  function openEdit(item: any) {
    setEditItem(item);
    setForm({
      name: item.name || '',
      slug: item.slug || '',
      description: item.description || '',
      cover_image: item.cover_image || '',
      sort_order: item.sort_order || 0,
    });
    setShowForm(true);
  }

  async function handleSave() {
    try {
      if (editItem) {
        await api.admin.series.update(editItem.id, form);
      } else {
        await api.admin.series.create(form);
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除此系列？')) return;
    try {
      await api.admin.series.delete(id);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>文章系列</h1>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
          style={{ background: 'var(--primary)', boxShadow: '0 0 16px var(--primary-glow)' }}>
          <Plus className="w-4 h-4" />
          新建系列
        </button>
      </div>

      {loading ? <Loading /> : items.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
          <Bookmark className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无系列</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>Slug</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>描述</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.name}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{item.slug}</td>
                  <td className="px-4 py-3 text-sm line-clamp-1" style={{ color: 'var(--text-info)' }}>{item.description || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setShowPosts(item)}
                        className="p-1.5 rounded-lg btn-glass" style={{ color: 'var(--text-info)' }} title="设置文章">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(item)}
                        className="p-1.5 rounded-lg btn-glass" style={{ color: 'var(--text-info)' }} title="编辑">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(item.id)}
                        className="p-1.5 rounded-lg btn-glass" style={{ color: 'var(--color-error)' }} title="删除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}>
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              {editItem ? '编辑系列' : '新建系列'}
            </h2>
            <div className="space-y-3">
              <input placeholder="名称 *" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none glass-card"
                style={{ color: 'var(--text-primary)' }} />
              <input placeholder="Slug" value={form.slug}
                onChange={e => setForm({ ...form, slug: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none glass-card"
                style={{ color: 'var(--text-primary)' }} />
              <textarea placeholder="描述" value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none glass-card resize-none"
                style={{ color: 'var(--text-primary)' }} rows={3} />
              <input placeholder="封面图 URL" value={form.cover_image}
                onChange={e => setForm({ ...form, cover_image: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none glass-card"
                style={{ color: 'var(--text-primary)' }} />
              <input type="number" placeholder="排序权重" value={form.sort_order}
                onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none glass-card"
                style={{ color: 'var(--text-primary)' }} />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl text-sm btn-glass" style={{ color: 'var(--text-secondary)' }}>取消</button>
              <button onClick={handleSave}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
                style={{ background: 'var(--primary)' }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Set Posts Modal */}
      {showPosts && <SetPostsModal series={showPosts} onClose={() => { setShowPosts(null); load(); }} />}
    </div>
  );
}

function SetPostsModal({ series, onClose }: { series: any; onClose: () => void }) {
  const [allPosts, setAllPosts] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    api.admin.posts.list({ page_size: '100' }).then(res => {
      setAllPosts(res.items || []);
    }).catch(() => {});
    api.admin.series.listPosts(series.id).then(res => {
      setSelectedIds((res.items || []).map((p: any) => p.id));
    }).catch(() => {});
  }, [series.id]);

  function togglePost(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    try {
      await api.admin.series.setPosts(series.id, selectedIds);
      onClose();
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg max-h-[70vh] overflow-y-auto rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}>
        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          设置「{series.name}」的文章
        </h2>
        <div className="space-y-2">
          {allPosts.map((post: any) => (
            <label key={post.id}
              className="flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors hover:opacity-80"
              style={{ background: selectedIds.includes(post.id) ? 'var(--primary-sub)' : 'var(--btn-card-bg)' }}>
              <input type="checkbox" checked={selectedIds.includes(post.id)}
                onChange={() => togglePost(post.id)}
                className="rounded" style={{ accentColor: 'var(--primary)' }} />
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{post.title}</span>
              <span className="text-xs ml-auto" style={{ color: 'var(--text-info)' }}>
                {post.status === 'published' ? '已发布' : '草稿'}
              </span>
            </label>
          ))}
          {allPosts.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-info)' }}>暂无文章</p>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm btn-glass" style={{ color: 'var(--text-secondary)' }}>取消</button>
          <button onClick={handleSave}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: 'var(--primary)' }}>保存</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建系列前台页面**

`frontend/src/app/series/[slug]/page.tsx`：

```tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Bookmark, Calendar, Eye } from 'lucide-react';
import { Loading } from '@/components/Loading';

export default function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  const [series, setSeries] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSeriesBySlug(slug).then(res => {
      setSeries(res.series);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <Loading />;
  if (!series) {
    return (
      <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
        <p className="text-lg mb-2">系列不存在</p>
        <Link href="/" className="text-sm hover:underline" style={{ color: 'var(--primary)' }}>返回首页</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="glass-card rounded-2xl p-6 mb-8">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{series.name}</h1>
        {series.description && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{series.description}</p>
        )}
        <p className="text-xs mt-2" style={{ color: 'var(--text-info)' }}>
          共 {series.posts?.length || 0} 篇文章
        </p>
      </div>

      <div className="space-y-4">
        {series.posts?.map((post: any, index: number) => (
          <Link key={post.id} href={`/posts/${post.slug}`}
            className="block glass-card rounded-2xl p-5 transition-all hover:translate-y-[-2px]">
            <div className="flex items-start gap-4">
              {post.cover_image && (
                <img src={post.cover_image} alt={post.title}
                  className="w-24 h-16 rounded-lg object-cover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--text-info)' }}>
                  <span>第 {index + 1} 篇</span>
                  {post.published_at && (
                    <>
                      <span>·</span>
                      <Calendar className="w-3 h-3" />
                      {new Date(post.published_at).toLocaleDateString('zh-CN')}
                    </>
                  )}
                </div>
                <h2 className="font-bold line-clamp-1" style={{ color: 'var(--text-primary)' }}>{post.title}</h2>
                {post.excerpt && (
                  <p className="text-sm line-clamp-2 mt-1" style={{ color: 'var(--text-secondary)' }}>{post.excerpt}</p>
                )}
              </div>
            </div>
          </Link>
        ))}
        {(!series.posts || series.posts.length === 0) && (
          <p className="text-center py-10" style={{ color: 'var(--text-info)' }}>暂无文章</p>
        )}
      </div>
    </div>
  );
}
```

需要添加 `import React from 'react';` 到文件头部。

- [ ] **Step 3: 在文章编辑器中集成系列选择**

在 `frontend/src/app/admin/posts/page.tsx` 的 `PostEditor` 组件中添加 series 选择。

在合适位置（category 选择下方或 tag 选择附近）添加 series 下拉选择：

```tsx
const [seriesList, setSeriesList] = useState<any[]>([]);
const [selectedSeriesId, setSelectedSeriesId] = useState(post?.series?.[0]?.id || '');
```

在 `useEffect` 中加载系列列表：
```tsx
api.admin.series.list().then(res => setSeriesList(res.items || [])).catch(() => {});
```

在表单中添加 series 选择 UI（在 category 下拉之后）：
```tsx
{/* Series */}
<select value={selectedSeriesId} onChange={e => setSelectedSeriesId(e.target.value)}
  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none glass-card"
  style={{ color: 'var(--text-primary)' }}>
  <option value="">无系列</option>
  {seriesList.map((s: any) => (
    <option key={s.id} value={s.id}>{s.name}</option>
  ))}
</select>
```

在保存逻辑中，将 `selectedSeriesId` 作为系列关联数据发送到后端。注意：后端 Create/Update 方法需要处理 series 关联。修改 `PostHandler.Create` 和 `PostHandler.Update` 以支持 series_id 参数。

- [ ] **Step 4: 在后端 PostHandler 中添加 series 支持**

在 `backend/internal/handler/post.go` 的 Create handler 中，添加 `SeriesID` 到 input struct，并在创建 post 后设置 series 关联：

input struct 中添加：
```go
SeriesID string `json:"series_id"`
```

在设置 tags 之后（`h.repo.SetTags(post.ID, tagIDs)`）之后添加：
```go
// Set series
if input.SeriesID != "" {
	if sid, err := uuid.Parse(input.SeriesID); err == nil {
		h.repo.SetSeries(post.ID, sid)
	}
}
```

在 PostRepo 中添加 `SetSeries` 方法：
```go
func (r *PostRepo) SetSeries(postID uuid.UUID, seriesID uuid.UUID) error {
	// Clear existing series associations for this post
	r.db.Where("post_id = ?", postID).Delete(&model.PostSeries{})
	// Create new association
	return r.db.Create(&model.PostSeries{SeriesID: seriesID, PostID: postID}).Error
}
```

在 Update handler 的 input struct 中也添加 `SeriesID *string`，并在 tag 处理后添加 series 更新逻辑。

- [ ] **Step 5: 在文章详情页显示系列信息**

在 `frontend/src/app/posts/[slug]/page.tsx` 的标题下方 meta 区域添加系列名显示。

在 `category & tags` 区域附近添加：
```tsx
{post.series?.length > 0 && (
  <Link href={`/series/${post.series[0].slug}`}
    className="flex items-center gap-1 text-sm mb-2"
    style={{ color: 'var(--primary)' }}>
    <Bookmark className="w-3.5 h-3.5" />
    {post.series[0].name}
  </Link>
)}
```

需要导入 `Bookmark` from `lucide-react`。

- [ ] **Step 6: 添加系列管理到 admin 侧边栏**

查看 `frontend/src/app/admin/layout.tsx` 并在侧边栏导航中添加系列链接。

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/frontend && cat src/app/admin/layout.tsx | grep -n "href\|Link\|nav\|系列\|标签\|分类"
```

在合适位置添加：
```tsx
{ icon: Bookmark, label: '系列', href: '/admin/series' },
```

- [ ] **Step 7: 编译验证**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/backend && go build ./...
cd /Users/tano/Documents/GitHub/personal/tano_blog/frontend && npm run build 2>&1 | head -50
```

Expected: Both PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog && git add backend/internal/handler/post.go backend/internal/repository/repositories.go frontend/src/app/admin/series/page.tsx frontend/src/app/series/ frontend/src/app/admin/posts/page.tsx frontend/src/app/posts/ frontend/src/app/admin/layout.tsx && git commit -m "feat: add series management (CRUD, post assignment, public page)"
```

---

### Task 13: 端到端验证

- [ ] **Step 1: 检查所有新增的路由**

确认 `main.go` 中包含以下路由：

公开路由：
- GET /api/v1/series
- GET /api/v1/series/:slug
- GET /api/v1/posts/:slug/adjacent
- GET /api/v1/posts/:slug/related
- POST /api/v1/posts/:slug/comments/:id/reactions

Admin 路由：
- GET/POST/PUT/DELETE /api/v1/admin/series
- GET /api/v1/admin/series/:id/posts
- PUT /api/v1/admin/series/:id/posts

- [ ] **Step 2: 完整编译验证**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/backend && go build ./... && go vet ./...
cd /Users/tano/Documents/GitHub/personal/tano_blog/frontend && npm run build
```

Expected: Both PASS with no errors.

- [ ] **Step 3: 最终提交**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog && git add -A && git commit -m "feat: complete 7 engagement features"
```
