# 后台管理增强实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracing.

**Goal:** 实现 7 个后台管理增强功能：评论者管理/黑名单、统计详情页、后台通知中心、数据导出、日程日历视图、媒体增强（预览+批量操作）、评论编辑历史

**Architecture:** 后端 Go + Gin + GORM (PostgreSQL)，前端 React 19 + Next.js 16 (App Router) + Tailwind CSS v4。7 个功能相对独立，可并行实现。

**Tech Stack:** Go 1.22+, Gin, GORM, PostgreSQL 16, Next.js 16, Tailwind CSS v4

## 全局约束

- 后端所有新 model 加入 `AutoMigrate()` 调用
- 所有新 endpoint 注册在 `backend/cmd/server/main.go` 对应路由组
- 所有新前端页面注册在 `frontend/src/app/admin/` 下
- 前端 API 调用通过 `frontend/src/lib/api.ts` 的 `api` 对象
- 错误信息使用中文
- 遵循已有代码模式：Handler → Repository → GORM

---
## 文件结构总览

| 模块 | 新建文件 | 修改文件 |
|------|----------|----------|
| 评论者管理/黑名单 | `backend/internal/handler/commenter.go` | `backend/internal/model/models.go`, `backend/cmd/server/main.go`, `backend/internal/repository/repositories.go`, `backend/internal/handler/comment.go`, `frontend/src/app/admin/comments/page.tsx` |
| 统计详情页 | `frontend/src/app/admin/analytics/page.tsx` | `backend/internal/model/models.go`, `backend/internal/handler/config_accesslog.go`, `backend/internal/repository/repositories.go`, `backend/cmd/server/main.go`, `backend/internal/middleware/access_log.go`, `backend/internal/utils/` |
| 通知中心 | `backend/internal/handler/notification.go`, `backend/internal/repository/notification.go` | `backend/internal/model/models.go`, `backend/cmd/server/main.go`, `backend/internal/handler/comment.go`, `backend/internal/handler/friend_link.go`, `frontend/src/app/admin/layout.tsx`, `frontend/src/app/admin/notifications/page.tsx` |
| 数据导出 | - | `backend/internal/handler/comment.go`, `backend/internal/handler/friend_link.go`, `backend/cmd/server/main.go`, `frontend/src/app/admin/comments/page.tsx`, `frontend/src/app/admin/links/page.tsx`, `frontend/src/lib/api.ts` |
| 日程日历 | `frontend/src/app/admin/calendar/page.tsx` | `backend/internal/handler/post.go`, `backend/cmd/server/main.go`, `frontend/src/lib/api.ts`, `frontend/src/app/admin/layout.tsx` |
| 媒体预览增强 | - | `frontend/src/app/admin/media/page.tsx` |
| 媒体批量操作 | - | `backend/internal/handler/media.go`, `backend/cmd/server/main.go`, `backend/internal/repository/repositories.go`, `frontend/src/app/admin/media/page.tsx`, `frontend/src/lib/api.ts` |
| 评论编辑历史 | - | `backend/internal/model/models.go`, `backend/internal/handler/comment.go`, `backend/internal/repository/repositories.go`, `backend/cmd/server/main.go`, `frontend/src/app/admin/comments/page.tsx` |

---

### Task 1: 评论者管理 / 黑名单

**Files:**
- Modify: `backend/internal/model/models.go`
- Create: `backend/internal/handler/commenter.go`
- Modify: `backend/internal/repository/repositories.go`
- Modify: `backend/internal/handler/comment.go`
- Modify: `backend/cmd/server/main.go`
- Modify: `frontend/src/app/admin/comments/page.tsx`

**Interfaces:**
- Produces: `model.CommenterBlock` 结构体, `CommenterHandler`, 前端评论者管理 UI
- Consumes: 已有 `Comment` model 和 `CommentRepo`

#### Backend

- [ ] **Step 1: 添加 CommenterBlock 模型**

在 `backend/internal/model/models.go` 中添加新结构体（放在 FriendLink 之前）：

```go
type CommenterBlock struct {
    ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    Email     string    `gorm:"size:255;index" json:"email,omitempty"`
    IPAddress string    `gorm:"size:45;index" json:"ip_address,omitempty"`
    Reason    string    `gorm:"size:500" json:"reason"`
    CreatedBy uuid.UUID `gorm:"type:uuid" json:"created_by"`
    CreatedAt time.Time `json:"created_at"`
}
```

在 `AutoMigrate()` 中添加 `&CommenterBlock{}`。

- [ ] **Step 2: 添加 CommenterBlock 仓库方法**

在 `backend/internal/repository/repositories.go` 末尾添加新结构体和方法：

```go
type CommenterBlockRepo struct {
    db *gorm.DB
}

func NewCommenterBlockRepo(db *gorm.DB) *CommenterBlockRepo {
    return &CommenterBlockRepo{db: db}
}

func (r *CommenterBlockRepo) Create(block *model.CommenterBlock) error {
    return r.db.Create(block).Error
}

func (r *CommenterBlockRepo) Delete(id uuid.UUID) error {
    return r.db.Delete(&model.CommenterBlock{}, id).Error
}

func (r *CommenterBlockRepo) List(page, pageSize int) ([]model.CommenterBlock, int64, error) {
    var items []model.CommenterBlock
    var total int64
    r.db.Model(&model.CommenterBlock{}).Count(&total)
    err := r.db.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items).Error
    return items, total, err
}

func (r *CommenterBlockRepo) IsBlocked(email, ip string) bool {
    query := r.db.Model(&model.CommenterBlock{})
    if email != "" {
        query = query.Where("email = ?", email)
    }
    if ip != "" {
        query = query.Where("ip_address = ?", ip)
    }
    var count int64
    query.Count(&count)
    return count > 0
}

// ListCommentsByEmailOrIP 列出某个邮箱或 IP 的所有评论
func (r *CommenterBlockRepo) ListCommentsByEmailOrIP(email, ip string, page, pageSize int) ([]model.Comment, int64, error) {
    var items []model.Comment
    var total int64
    q := r.db.Model(&model.Comment{}).Preload("Post")
    if email != "" {
        q = q.Where("email = ?", email)
    }
    if ip != "" {
        q = q.Where("ip_address = ?", ip)
    }
    q.Count(&total)
    err := q.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items).Error
    return items, total, err
}
```

- [ ] **Step 3: 创建 CommenterHandler**

创建 `backend/internal/handler/commenter.go`：

```go
package handler

import (
    "net/http"

    "github.com/gin-gonic/gin"
    "github.com/google/uuid"
    "gorm.io/gorm"

    "tano_blog/backend/internal/model"
    "tano_blog/backend/internal/repository"
)

type CommenterHandler struct {
    blockRepo *repository.CommenterBlockRepo
    db        *gorm.DB
}

func NewCommenterHandler(db *gorm.DB) *CommenterHandler {
    return &CommenterHandler{
        blockRepo: repository.NewCommenterBlockRepo(db),
        db:        db,
    }
}

// Block 封禁评论者
func (h *CommenterHandler) Block(c *gin.Context) {
    var input struct {
        Email     string `json:"email"`
        IPAddress string `json:"ip_address"`
        Reason    string `json:"reason"`
    }
    if err := c.ShouldBindJSON(&input); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
        return
    }
    if input.Email == "" && input.IPAddress == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "请提供邮箱或IP地址"})
        return
    }

    adminID, _ := c.Get("user_id")
    uid, _ := uuid.Parse(adminID.(string))

    block := model.CommenterBlock{
        Email:     input.Email,
        IPAddress: input.IPAddress,
        Reason:    input.Reason,
        CreatedBy: uid,
    }
    if err := h.blockRepo.Create(&block); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"message": "已封禁"})
}

// Unblock 解封评论者
func (h *CommenterHandler) Unblock(c *gin.Context) {
    id, err := uuid.Parse(c.Param("id"))
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
        return
    }
    if err := h.blockRepo.Delete(id); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"message": "已解封"})
}

// ListBlocks 列出封禁列表
func (h *CommenterHandler) ListBlocks(c *gin.Context) {
    page := parseInt(c.Query("page"), 1)
    pageSize := parseInt(c.Query("page_size"), 20)
    items, total, err := h.blockRepo.List(page, pageSize)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "获取失败"})
        return
    }
    c.JSON(http.StatusOK, gin.H{
        "items": items,
        "total": total,
        "page":  page,
        "size":  pageSize,
    })
}

// ListCommenterComments 查看某个评论者的所有评论
func (h *CommenterHandler) ListCommenterComments(c *gin.Context) {
    email := c.Query("email")
    ip := c.Query("ip_address")
    if email == "" && ip == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "请提供邮箱或IP地址"})
        return
    }
    page := parseInt(c.Query("page"), 1)
    pageSize := parseInt(c.Query("page_size"), 20)
    items, total, err := h.blockRepo.ListCommentsByEmailOrIP(email, ip, page, pageSize)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "获取失败"})
        return
    }
    c.JSON(http.StatusOK, gin.H{
        "items": items,
        "total": total,
        "page":  page,
        "size":  pageSize,
    })
}
```

- [ ] **Step 4: 在 comment Create 中添加黑名单检查**

在 `backend/internal/handler/comment.go` 的 `Create` 方法的蜜罐检查之后、创建评论之前添加：

```go
// 检查是否被拉黑
blockRepo := repository.NewCommenterBlockRepo(h.db)
if blockRepo.IsBlocked(input.Email, c.ClientIP()) {
    // 返回成功但不创建评论，防探测
    c.JSON(http.StatusOK, gin.H{"comment": gin.H{"id": "", "content": input.Content, "nickname": input.Nickname, "created_at": time.Now().Format(time.RFC3339)}})
    return
}
```

需要添加 `"tano_blog/backend/internal/repository"` 和 `"time"` 导入（handler 可能尚未导入 repository 包；如果已有则跳过）。

注意：`h.db` 需要在 CommentHandler 结构体中可用。确认 CommentHandler 已有 `db *gorm.DB` 字段（第 15 行：`type CommentHandler struct { repo *repository.CommentRepo; db *gorm.DB; emailService *service.EmailService }`），是的。

- [ ] **Step 5: 注册路由**

在 `backend/cmd/server/main.go` 的 admin 路由组中添加：

```go
// 在文件顶部 handlers 区域初始化
commenterHandler := handler.NewCommenterHandler(db)

// 在 admin 路由组内添加
admin.GET("/commenters", commenterHandler.ListBlocks)
admin.POST("/commenters", commenterHandler.Block)
admin.DELETE("/commenters/:id", commenterHandler.Unblock)
admin.GET("/commenters/comments", commenterHandler.ListCommenterComments)
```

- [ ] **Step 6: 前端 — 增强评论管理页面**

在 `frontend/src/app/admin/comments/page.tsx` 中：

**新增 tab 栏**：在现有的状态过滤 tab（全部/待审核/已批准/已拒绝/垃圾）之后，增加"评论者"和"封禁列表"两个 tab。

**"评论者" tab**：
- 搜索框：输入邮箱或 IP 地址
- 搜索后显示该评论者的所有评论列表（调用 `GET /api/v1/admin/commenters/comments?email=xxx`）
- 每条评论显示：文章标题、内容片段、时间、状态
- "封禁"按钮（按邮箱或 IP），点击弹出确认对话框
- 成功后刷新列表

**"封禁列表" tab**：
- 表格列出所有封禁记录：邮箱、IP、原因、操作人、时间
- "解封"按钮，点击确认后调用 `DELETE /api/v1/admin/commenters/:id`
- 分页

**添加 API 调用**到 `frontend/src/lib/api.ts` 的 `api.admin` 对象下：

```typescript
admin: {
  // ... 已有代码 ...
  commenters: {
    list: (params?: Record<string, string>) =>
      request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/commenters', { params }),
    block: (data: { email?: string; ip_address?: string; reason?: string }) =>
      request('/api/v1/admin/commenters', { method: 'POST', body: JSON.stringify(data) }),
    unblock: (id: string) =>
      request(`/api/v1/admin/commenters/${id}`, { method: 'DELETE' }),
    listComments: (params: { email?: string; ip_address?: string; page?: number; page_size?: number }) =>
      request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/commenters/comments', { params }),
  },
}
```

---

### Task 2: 统计详情页（带 GeoIP）

**Files:**
- Modify: `backend/internal/middleware/access_log.go`
- Modify: `backend/internal/handler/config_accesslog.go`
- Modify: `backend/internal/repository/repositories.go`
- Modify: `backend/cmd/server/main.go`
- Create: `frontend/src/app/admin/analytics/page.tsx`

**Interfaces:**
- Produces: GeoIP 填充、新增统计 endpoint、独立统计页面
- Consumes: 已有 `AccessLog` 模型和 `AccessLogRepo`

#### Backend

- [ ] **Step 1: 添加 GeoIP 依赖**

在 `backend/go.mod` 中添加：

```
require github.com/oschwald/geoip2-golang v1.11.0
```

运行 `cd backend && go mod tidy`。

- [ ] **Step 2: 创建 GeoIP 工具**

在 `.env` 或配置中添加 `GEOIP_DB_PATH`（指向 GeoLite2-City.mmdb 文件），默认空字符串表示不使用 GeoIP。

在 `backend/internal/utils/geoip.go` 中：

```go
package utils

import (
    "net"
    "os"
    "sync"

    "github.com/oschwald/geoip2-golang"
)

var (
    geoDB   *geoip2.Reader
    geoOnce sync.Once
    geoErr  error
)

func InitGeoIP() {
    path := os.Getenv("GEOIP_DB_PATH")
    if path == "" {
        LogWarn("GEOIP_DB_PATH not set, GeoIP disabled")
        return
    }
    geoOnce.Do(func() {
        geoDB, geoErr = geoip2.Open(path)
        if geoErr != nil {
            LogWarn("failed to open GeoIP database", "error", geoErr)
        }
    })
}

func LookupIP(ipStr string) (country, city string) {
    if geoDB == nil {
        return "", ""
    }
    ip := net.ParseIP(ipStr)
    if ip == nil {
        return "", ""
    }
    record, err := geoDB.City(ip)
    if err != nil {
        return "", ""
    }
    return record.Country.IsoCode, record.City.Name
}

func CloseGeoIP() {
    if geoDB != nil {
        geoDB.Close()
    }
}
```

- [ ] **Step 3: 初始化 GeoIP**

在 `backend/cmd/server/main.go` 的 `main()` 开头调用 `database connect` 和 `AutoMigrate` 之后添加：

```go
utils.InitGeoIP()
```

在 `srv.Shutdown` 后添加：

```go
utils.CloseGeoIP()
```

- [ ] **Step 4: 在 AccessLog 中间件中填充 Country/City**

修改 `backend/internal/middleware/access_log.go` 中构建 `log` 结构体的位置，在 `Referer` 行之前添加：

```go
country, city := utils.LookupIP(c.ClientIP())
```

然后在 `log` 结构体初始化中传入：

```go
Country: country,
City:    city,
```

- [ ] **Step 5: 新增统计 endpoint**

在 `backend/internal/handler/config_accesslog.go` 的 AccessLogHandler 中添加：

```go
// StatsByCountry 按国家统计
func (h *AccessLogHandler) StatsByCountry(c *gin.Context) {
    data, err := h.repo.StatsByCountry()
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "获取统计失败"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"items": data})
}

// StatsByReferrer 按来源统计
func (h *AccessLogHandler) StatsByReferrer(c *gin.Context) {
    data, err := h.repo.StatsByReferrer()
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "获取统计失败"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"items": data})
}

// StatsByPath 按页面统计
func (h *AccessLogHandler) StatsByPath(c *gin.Context) {
    data, err := h.repo.StatsByPath()
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "获取统计失败"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"items": data})
}

// StatsByStatusCode 按状态码统计
func (h *AccessLogHandler) StatsByStatusCode(c *gin.Context) {
    data, err := h.repo.StatsByStatusCode()
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "获取统计失败"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"items": data})
}

// StatsTimeRange 支持自定义时间范围
func (h *AccessLogHandler) StatsTimeRange(c *gin.Context) {
    start := c.Query("start") // YYYY-MM-DD
    end := c.Query("end")     // YYYY-MM-DD
    data, err := h.repo.StatsTimeRange(start, end)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "获取统计失败"})
        return
    }
    c.JSON(http.StatusOK, data)
}
```

- [ ] **Step 6: 在 repository 中添加新统计方法**

在 `backend/internal/repository/repositories.go` 的 AccessLogRepo 中添加：

```go
// StatsByCountry ...
func (r *AccessLogRepo) StatsByCountry() ([]NameCount, error) {
    var items []NameCount
    err := r.db.Model(&model.AccessLog{}).
        Select("COALESCE(NULLIF(country, ''), '未知') as name, COUNT(*) as count").
        Group("name").Order("count DESC").Limit(20).Find(&items).Error
    return items, err
}

// StatsByReferrer ...
func (r *AccessLogRepo) StatsByReferrer() ([]NameCount, error) {
    var items []NameCount
    err := r.db.Model(&model.AccessLog{}).
        Select("COALESCE(NULLIF(referer, ''), '直接访问') as name, COUNT(*) as count").
        Group("name").Order("count DESC").Limit(20).Find(&items).Error
    return items, err
}

// StatsByPath ...
func (r *AccessLogRepo) StatsByPath() ([]NameCount, error) {
    var items []NameCount
    err := r.db.Model(&model.AccessLog{}).
        Select("path as name, COUNT(*) as count").
        Group("path").Order("count DESC").Limit(20).Find(&items).Error
    return items, err
}

// StatsByStatusCode ...
func (r *AccessLogRepo) StatsByStatusCode() ([]NameCount, error) {
    var items []NameCount
    err := r.db.Model(&model.AccessLog{}).
        Select("CAST(status_code AS TEXT) as name, COUNT(*) as count").
        Group("name").Order("count DESC").Find(&items).Error
    return items, err
}

// StatsTimeRange 自定义时间范围统计
type TimeRangeStats struct {
    TotalRequests int64            `json:"total_requests"`
    UniqueIPs     int64            `json:"unique_ips"`
    TotalErrors   int64            `json:"total_errors"`
    AvgResponseMs float64          `json:"avg_response_ms"`
    DailyCounts   []DailyCount     `json:"daily_counts"`
}

func (r *AccessLogRepo) StatsTimeRange(start, end string) (*TimeRangeStats, error) {
    query := r.db.Model(&model.AccessLog{})
    if start != "" {
        query = query.Where("created_at >= ?", start+" 00:00:00")
    }
    if end != "" {
        query = query.Where("created_at <= ?", end+" 23:59:59")
    }

    var stats TimeRangeStats
    query.Count(&stats.TotalRequests)
    query.Select("COUNT(DISTINCT ip_address)").Scan(&stats.UniqueIPs)
    query.Where("status_code >= 400").Count(&stats.TotalErrors)
    query.Select("COALESCE(AVG(response_time), 0)").Scan(&stats.AvgResponseMs)

    rows, err := query.Select("DATE(created_at) as date, COUNT(*) as count").
        Group("DATE(created_at)").Order("date ASC").Rows()
    if err != nil {
        return &stats, nil
    }
    defer rows.Close()
    for rows.Next() {
        var dc DailyCount
        rows.Scan(&dc.Date, &dc.Count)
        stats.DailyCounts = append(stats.DailyCounts, dc)
    }
    return &stats, nil
}
```

注意：`NameCount` 和 `DailyCount` 结构体可能已经存在于 AccessLogRepo 中。确认后在已有的位置添加新方法。

- [ ] **Step 7: 注册新路由**

在 `backend/cmd/server/main.go` 的 admin 路由组中添加：

```go
admin.GET("/access-logs/stats/country", accessLogHandler.StatsByCountry)
admin.GET("/access-logs/stats/referrer", accessLogHandler.StatsByReferrer)
admin.GET("/access-logs/stats/path", accessLogHandler.StatsByPath)
admin.GET("/access-logs/stats/status-code", accessLogHandler.StatsByStatusCode)
admin.GET("/access-logs/stats/time-range", accessLogHandler.StatsTimeRange)
```

#### Frontend

- [ ] **Step 8: 创建统计详情页**

创建 `frontend/src/app/admin/analytics/page.tsx`。

该页面包含以下区域（从上到下）：

**顶部统计概览卡片**：调用 `statsTimeRange` 显示总请求数、独立 IP、错误数、平均响应时间。
**时间范围选择器**：两个 `<input type="date">` 选择起止日期，默认最近 7 天。
**访问趋势图**：与 dashboard 相同的 SVG 柱状/折线图，但数据来自自定义时间范围。
**页面排行表**：调用 `statsByPath`，表格列出 TOP 20 页面路径和访问次数。
**来源分析**：调用 `statsByReferrer`，横向柱状图显示 TOP 20 来源。
**国家/地区分布**：调用 `statsByCountry`，横向柱状图显示 TOP 20 国家。
**状态码分布**：调用 `statsByStatusCode`，饼图或柱状图显示 2xx/3xx/4xx/5xx 分布。
**设备/浏览器/OS/时段分布**：调用已有统计 endpoint，复用 dashboard 的图表逻辑。

可整体复用 dashboard 已有图表组件（设备、浏览器、OS、时段分布）的渲染代码，将柱状图/条形图渲染提取为 `src/components/Chart.tsx` 或直接内联复制。

---

### Task 3: 后台通知中心

**Files:**
- Modify: `backend/internal/model/models.go`
- Create: `backend/internal/handler/notification.go`
- Create: `backend/internal/repository/notification.go`
- Modify: `backend/internal/handler/comment.go`
- Modify: `backend/internal/handler/friend_link.go`
- Modify: `backend/cmd/server/main.go`
- Create: `frontend/src/app/admin/notifications/page.tsx`
- Modify: `frontend/src/app/admin/layout.tsx`
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Produces: `model.Notification`, 通知 CRUD handler, 前端通知中心页面 + 布局铃铛图标

#### Backend

- [ ] **Step 1: 添加 Notification 模型**

在 `backend/internal/model/models.go` 中添加：

```go
type Notification struct {
    ID        uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    UserID    uuid.UUID  `gorm:"type:uuid;index;not null" json:"user_id"`
    Type      string     `gorm:"size:50;not null;index" json:"type"` // "new_comment", "link_apply", "comment_approved", "reply"
    Title     string     `gorm:"size:500;not null" json:"title"`
    Content   string     `gorm:"type:text" json:"content"`
    Link      string     `gorm:"size:1000" json:"link"` // 点击跳转链接
    IsRead    bool       `gorm:"default:false;index" json:"is_read"`
    CreatedAt time.Time  `json:"created_at"`
}
```

在 `AutoMigrate()` 中添加 `&Notification{}`。

- [ ] **Step 2: 创建 NotificationRepo**

创建 `backend/internal/repository/notification.go`：

```go
package repository

import (
    "github.com/google/uuid"
    "gorm.io/gorm"

    "tano_blog/backend/internal/model"
)

type NotificationRepo struct {
    db *gorm.DB
}

func NewNotificationRepo(db *gorm.DB) *NotificationRepo {
    return &NotificationRepo{db: db}
}

func (r *NotificationRepo) Create(n *model.Notification) error {
    return r.db.Create(n).Error
}

func (r *NotificationRepo) List(userID uuid.UUID, page, pageSize int, unreadOnly bool) ([]model.Notification, int64, error) {
    var items []model.Notification
    var total int64
    q := r.db.Model(&model.Notification{}).Where("user_id = ?", userID)
    if unreadOnly {
        q = q.Where("is_read = ?", false)
    }
    q.Count(&total)
    err := q.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items).Error
    return items, total, err
}

func (r *NotificationRepo) MarkRead(id, userID uuid.UUID) error {
    return r.db.Model(&model.Notification{}).Where("id = ? AND user_id = ?", id, userID).Update("is_read", true).Error
}

func (r *NotificationRepo) MarkAllRead(userID uuid.UUID) error {
    return r.db.Model(&model.Notification{}).Where("user_id = ? AND is_read = ?", userID, false).Update("is_read", true).Error
}

func (r *NotificationRepo) UnreadCount(userID uuid.UUID) (int64, error) {
    var count int64
    err := r.db.Model(&model.Notification{}).Where("user_id = ? AND is_read = ?", userID, false).Count(&count).Error
    return count, err
}
```

- [ ] **Step 3: 创建 NotificationHandler**

创建 `backend/internal/handler/notification.go`：

```go
package handler

import (
    "net/http"

    "github.com/gin-gonic/gin"
    "github.com/google/uuid"
    "gorm.io/gorm"

    "tano_blog/backend/internal/model"
    "tano_blog/backend/internal/repository"
)

type NotificationHandler struct {
    repo *repository.NotificationRepo
}

func NewNotificationHandler(db *gorm.DB) *NotificationHandler {
    return &NotificationHandler{
        repo: repository.NewNotificationRepo(db),
    }
}

func (h *NotificationHandler) List(c *gin.Context) {
    userIDStr, _ := c.Get("user_id")
    userID, _ := uuid.Parse(userIDStr.(string))

    page := parseInt(c.Query("page"), 1)
    pageSize := parseInt(c.Query("page_size"), 20)
    unreadOnly := c.Query("unread") == "true"

    items, total, err := h.repo.List(userID, page, pageSize, unreadOnly)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "获取通知失败"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "size": pageSize})
}

func (h *NotificationHandler) MarkRead(c *gin.Context) {
    userIDStr, _ := c.Get("user_id")
    userID, _ := uuid.Parse(userIDStr.(string))
    notifID, err := uuid.Parse(c.Param("id"))
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
        return
    }
    if err := h.repo.MarkRead(notifID, userID); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func (h *NotificationHandler) MarkAllRead(c *gin.Context) {
    userIDStr, _ := c.Get("user_id")
    userID, _ := uuid.Parse(userIDStr.(string))
    if err := h.repo.MarkAllRead(userID); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func (h *NotificationHandler) UnreadCount(c *gin.Context) {
    userIDStr, _ := c.Get("user_id")
    userID, _ := uuid.Parse(userIDStr.(string))
    count, err := h.repo.UnreadCount(userID)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "获取失败"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"count": count})
}
```

- [ ] **Step 4: 在评论和友链创建时插入通知**

**修改 `backend/internal/handler/comment.go`** 的 `Create` 方法：

在创建评论成功之后、发送邮件之前，添加通知创建逻辑：

```go
// 通知管理员有新评论
adminNotif := model.Notification{
    UserID:  adminUser.ID, // 需要查询 admin 用户
    Type:    "new_comment",
    Title:   fmt.Sprintf("新评论：%s", input.Nickname),
    Content: truncateStr(input.Content, 100),
    Link:    fmt.Sprintf("/admin/comments"),
}
notifRepo := repository.NewNotificationRepo(h.db)
go notifRepo.Create(&adminNotif) // 异步执行

// 在回复时通知父评论者（如果有 email）
if parentID != nil && parent.Email != "" {
    replyNotif := model.Notification{
        UserID:  adminUser.ID, // 暂存到 admin
        Type:    "reply",
        Title:   fmt.Sprintf("%s 回复了你的评论", input.Nickname),
        Content: truncateStr(input.Content, 100),
        Link:    fmt.Sprintf("/posts/%s#comment-%s", post.Slug, newComment.ID),
    }
    go notifRepo.Create(&replyNotif)
}
```

注意：需要实现 `truncateStr(s string, maxLen int) string` 辅助函数。查询 admin 用户的逻辑可以复用已有方式或直接使用 `h.db` 查询第一个 admin。

**修改 `backend/internal/handler/friend_link.go`** 的 `Apply` 方法：

在成功创建友链申请后添加：

```go
adminNotif := model.Notification{
    UserID:  adminUser.ID,
    Type:    "link_apply",
    Title:   fmt.Sprintf("新友链申请：%s", input.Name),
    Content: input.Description,
    Link:    "/admin/links",
}
go repository.NewNotificationRepo(h.db).Create(&adminNotif)
```

- [ ] **Step 5: 注册路由**

在 `backend/cmd/server/main.go` 的 authRequired 路由组中添加：

```go
notifHandler := handler.NewNotificationHandler(db)

authRequired.GET("/notifications", notifHandler.List)
authRequired.GET("/notifications/unread-count", notifHandler.UnreadCount)
authRequired.PATCH("/notifications/:id/read", notifHandler.MarkRead)
authRequired.PATCH("/notifications/read-all", notifHandler.MarkAllRead)
```

注意：这些路由在 `authRequired` 组（只需要登录，不需要 admin 角色），因为通知是针对当前登录用户的。

#### Frontend

- [ ] **Step 6: 在 admin layout 中添加铃铛图标**

修改 `frontend/src/app/admin/layout.tsx`：

**添加状态变量**：
```typescript
const [notifCount, setNotifCount] = useState(0);
```

**在获取用户信息后轮询未读数**：
```typescript
// 在 useEffect 中，认证后调用
const fetchNotifCount = async () => {
    try {
        const res = await fetch('/api/v1/notifications/unread-count', { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            setNotifCount(data.count);
        }
    } catch {}
};

fetchNotifCount();
const interval = setInterval(fetchNotifCount, 30000); // 每 30 秒轮询
return () => clearInterval(interval);
```

**顶部导航添加铃铛图标**：在用户信息区域添加铃铛按钮，显示未读数徽章。

点击铃铛跳转到 `/admin/notifications`。

- [ ] **Step 7: 创建通知页面**

创建 `frontend/src/app/admin/notifications/page.tsx`：

- 通知列表，按时间倒序
- 每条通知显示：类型图标、标题、内容、时间、已读/未读状态
- "全部标记已读"按钮
- 分页
- 点击通知跳转到对应链接

- [ ] **Step 8: 添加 API 调用**

在 `frontend/src/lib/api.ts` 中添加：

```typescript
// Notifications
getNotifications: (params?: Record<string, string>) =>
    request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/notifications', { params }),
getUnreadCount: () =>
    request<{ count: number }>('/api/v1/notifications/unread-count'),
markNotificationRead: (id: string) =>
    request(`/api/v1/notifications/${id}/read`, { method: 'PATCH' }),
markAllNotificationsRead: () =>
    request('/api/v1/notifications/read-all', { method: 'PATCH' }),
```

---

### Task 4: 数据导出（评论 + 友链 CSV）

**Files:**
- Modify: `backend/internal/handler/comment.go`
- Modify: `backend/internal/handler/friend_link.go`
- Modify: `backend/cmd/server/main.go`
- Modify: `frontend/src/app/admin/comments/page.tsx`
- Modify: `frontend/src/app/admin/links/page.tsx`
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Consumes: 已有 `CommentRepo` 和 `FriendLink` handler

#### Backend

- [ ] **Step 1: 添加评论 CSV 导出**

在 `backend/internal/handler/comment.go` 的 CommentHandler 中添加：

```go
func (h *CommentHandler) ExportCSV(c *gin.Context) {
    status := c.Query("status")
    items, _, err := h.repo.AdminList(1, 10000, status)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "导出失败"})
        return
    }

    c.Header("Content-Type", "text/csv; charset=utf-8")
    c.Header("Content-Disposition", "attachment; filename=comments.csv")
    c.Writer.Write([]byte{0xEF, 0xBB, 0xBF}) // UTF-8 BOM

    w := csv.NewWriter(c.Writer)
    w.Write([]string{"时间", "昵称", "邮箱", "网站", "内容", "状态", "IP地址", "文章ID", "父评论ID", "UserAgent"})
    for _, item := range items {
        w.Write([]string{
            item.CreatedAt.Format("2006-01-02 15:04:05"),
            item.Nickname,
            item.Email,
            item.Website,
            item.Content,
            item.Status,
            item.IPAddress,
            item.PostID.String(),
            nullUUIDString(item.ParentID),
            item.UserAgent,
        })
    }
    w.Flush()
}

func nullUUIDString(id *uuid.UUID) string {
    if id == nil {
        return ""
    }
    return id.String()
}
```

注意：需要添加 `"encoding/csv"` 导入。

- [ ] **Step 2: 添加友链 CSV 导出**

在 `backend/internal/handler/friend_link.go` 的 FriendLinkHandler 中添加（如果该文件没有 handler 结构体，则添加；确认 friend_link.go 的文件结构）：

```go
func (h *FriendLinkHandler) ExportCSV(c *gin.Context) {
    var items []model.FriendLink
    h.db.Find(&items)

    c.Header("Content-Type", "text/csv; charset=utf-8")
    c.Header("Content-Disposition", "attachment; filename=friend_links.csv")
    c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})

    w := csv.NewWriter(c.Writer)
    w.Write([]string{"时间", "名称", "URL", "描述", "邮箱", "状态"})
    for _, item := range items {
        w.Write([]string{
            item.CreatedAt.Format("2006-01-02 15:04:05"),
            item.Name,
            item.URL,
            item.Description,
            item.Email,
            item.Status,
        })
    }
    w.Flush()
}
```

- [ ] **Step 3: 注册路由**

在 `backend/cmd/server/main.go` 的 admin 路由组中添加：

```go
admin.GET("/comments/export", commentHandler.ExportCSV)
admin.GET("/links/export", friendLinkHandler.ExportCSV)
```

#### Frontend

- [ ] **Step 4: 添加导出按钮**

在 `frontend/src/app/admin/comments/page.tsx` 的状态过滤栏旁边添加"导出 CSV"按钮：

```typescript
const handleExport = () => {
    const params = new URLSearchParams();
    if (activeTab !== 'all') params.set('status', activeTab);
    window.open(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/admin/comments/export?${params.toString()}`, '_blank');
};
```

在 `frontend/src/app/admin/links/page.tsx` 的状态过滤栏旁边添加"导出 CSV"按钮，类似实现。

- [ ] **Step 5: 添加 API 方法**

在 `frontend/src/lib/api.ts` 的 admin.comments 和 admin.links 中添加 export 方法：

```typescript
// 在 admin.comments 中
exportComments: (params?: Record<string, string>) => {
    const searchParams = params ? '?' + new URLSearchParams(params).toString() : '';
    window.open(`${API_BASE}/api/v1/admin/comments/export${searchParams}`, '_blank');
},

// 在 admin.links 中
exportLinks: (params?: Record<string, string>) => {
    const searchParams = params ? '?' + new URLSearchParams(params).toString() : '';
    window.open(`${API_BASE}/api/v1/admin/links/export${searchParams}`, '_blank');
},
```

---

### Task 5: 日程日历视图

**Files:**
- Modify: `backend/internal/handler/post.go`
- Modify: `backend/cmd/server/main.go`
- Create: `frontend/src/app/admin/calendar/page.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/app/admin/layout.tsx`

**Interfaces:**
- Consumes: 已有 `Post` 模型

#### Backend

- [ ] **Step 1: 添加日历数据 endpoint**

在 `backend/internal/handler/post.go` 的 PostHandler 中添加：

```go
// CalendarPosts 按年月返回日历数据
func (h *PostHandler) CalendarPosts(c *gin.Context) {
    year := c.Query("year")
    month := c.Query("month")
    if year == "" {
        year = time.Now().Format("2006")
    }
    if month == "" {
        month = time.Now().Format("01")
    }

    var posts []model.Post
    h.db.Where("EXTRACT(YEAR FROM published_at) = ? AND EXTRACT(MONTH FROM published_at) = ?", year, month).
        Or("EXTRACT(YEAR FROM created_at) = ? AND EXTRACT(MONTH FROM created_at) = ? AND status = 'draft' AND published_at IS NULL", year, month).
        Select("id, title, slug, status, published_at, created_at").
        Order("COALESCE(published_at, created_at) ASC").
        Find(&posts)

    type CalendarPost struct {
        ID          string    `json:"id"`
        Title       string    `json:"title"`
        Slug        string    `json:"slug"`
        Status      string    `json:"status"`
        Date        string    `json:"date"` // YYYY-MM-DD
    }

    result := make([]CalendarPost, 0)
    for _, p := range posts {
        date := p.CreatedAt.Format("2006-01-02")
        if p.PublishedAt != nil {
            date = p.PublishedAt.Format("2006-01-02")
        }
        result = append(result, CalendarPost{
            ID:     p.ID.String(),
            Title:  p.Title,
            Slug:   p.Slug,
            Status: p.Status,
            Date:   date,
        })
    }

    c.JSON(http.StatusOK, gin.H{"items": result})
}
```

- [ ] **Step 2: 注册路由**

在 `backend/cmd/server/main.go` 的 admin 路由组中添加：

```go
admin.GET("/posts/calendar", postHandler.CalendarPosts)
```

#### Frontend

- [ ] **Step 3: 创建日历页面**

创建 `frontend/src/app/admin/calendar/page.tsx`。

**日历网格**：
- 7 列布局（日 一 二 三 四 五 六），顶部显示年月
- 上个月/下个月导航按钮
- 每个格子显示日期数字
- 发布的文章：绿色圆点 + 文章标题（截断）
- 草稿文章：灰色圆点 + 文章标题
- 定时发布的草稿：橙色圆点 + 文章标题
- 点击文章跳转到编辑器
- 点击空白日期区域可以新建文章（跳转到编辑器并预设日期）

**获取数据**：
- 月份切换时调用 `GET /api/v1/admin/posts/calendar?year=2026&month=07`
- 前端按日期分组排列

- [ ] **Step 4: 添加 API 和侧边栏入口**

在 `frontend/src/lib/api.ts` 的 admin.posts 中添加：

```typescript
calendar: (params: { year: string; month: string }) =>
    request<{ items: any[] }>('/api/v1/admin/posts/calendar', { params }),
```

在 `frontend/src/app/admin/layout.tsx` 的侧边栏导航中添加日历入口（放在"文章"之后）：

```tsx
{ name: '日历', href: '/admin/calendar', icon: CalendarIcon }
```

需要从 lucide-react 导入 `Calendar` 图标。

---

### Task 6: 媒体预览增强

**Files:**
- Modify: `frontend/src/app/admin/media/page.tsx`

**Interfaces:**
- Consumes: 已有 `Media` 模型的 `mime_type` 字段

#### Frontend

- [ ] **Step 1: 增强媒体预览**

在 `frontend/src/app/admin/media/page.tsx` 中：

**找到媒体卡片的渲染区域**（grid view），在图标显示的位置改为根据 mime_type 渲染：

```typescript
const renderMediaPreview = (item: any) => {
    const mime = item.mime_type || '';
    if (mime.startsWith('video/')) {
        return (
            <video
                src={item.url}
                controls
                className="w-full h-full object-contain bg-black/20"
                preload="metadata"
                onClick={e => e.stopPropagation()}
            >
                您的浏览器不支持视频播放
            </video>
        );
    }
    if (mime.startsWith('audio/')) {
        return (
            <div className="flex items-center justify-center w-full h-full bg-gradient-to-br from-purple-500/10 to-blue-500/10">
                <audio
                    src={item.url}
                    controls
                    className="w-4/5"
                    preload="none"
                    onClick={e => e.stopPropagation()}
                >
                    您的浏览器不支持音频播放
                </audio>
            </div>
        );
    }
    if (mime.startsWith('image/')) {
        return (
            <img src={item.url} alt={item.original_name}
                className="w-full h-full object-cover"
                loading="lazy" />
        );
    }
    // 文档等显示图标
    return <FileText className="w-12 h-12 text-gray-400" />;
};
```

在 list view 中，为 video/audio 添加播放控件。

**注意**：需要确保预览不会阻止点击事件传播到卡片本身的操作区域。

---

### Task 7: 媒体库批量操作

**Files:**
- Modify: `backend/internal/handler/media.go`
- Modify: `backend/internal/repository/repositories.go`
- Modify: `backend/cmd/server/main.go`
- Modify: `frontend/src/app/admin/media/page.tsx`
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Produces: 批量删除和批量打标签 endpoint
- Consumes: 已有 `MediaRepo`

#### Backend

- [ ] **Step 1: 添加批量删除 repository**

在 `backend/internal/repository/repositories.go` 的 MediaRepo 中添加：

```go
func (r *MediaRepo) BatchDelete(ids []uuid.UUID) error {
    if len(ids) == 0 {
        return nil
    }
    // 先获取文件路径以删除磁盘文件
    var items []model.Media
    r.db.Where("id IN ?", ids).Find(&items)
    for _, item := range items {
        os.Remove(item.URL) // 忽略错误
    }
    return r.db.Where("id IN ?", ids).Delete(&model.Media{}).Error
}

func (r *MediaRepo) BatchUpdateTags(ids []uuid.UUID, tagIDs []uuid.UUID) error {
    if len(ids) == 0 {
        return nil
    }
    var items []model.Media
    r.db.Where("id IN ?", ids).Find(&items)
    for _, item := range items {
        r.db.Model(&item).Association("Tags").Replace(tagIDs)
    }
    return nil
}
```

注意：需要添加 `"os"` 导入。如果已有则跳过。

- [ ] **Step 2: 添加批量操作 handler**

在 `backend/internal/handler/media.go` 的 MediaHandler 中添加：

```go
func (h *MediaHandler) BatchDelete(c *gin.Context) {
    var input struct {
        IDs []string `json:"ids"`
    }
    if err := c.ShouldBindJSON(&input); err != nil || len(input.IDs) == 0 {
        c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
        return
    }

    ids := make([]uuid.UUID, len(input.IDs))
    for i, id := range input.IDs {
        uid, err := uuid.Parse(id)
        if err != nil {
            c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
            return
        }
        ids[i] = uid
    }

    if err := h.repo.BatchDelete(ids); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

func (h *MediaHandler) BatchUpdateTags(c *gin.Context) {
    var input struct {
        IDs    []string `json:"ids"`
        TagIDs []string `json:"tag_ids"`
    }
    if err := c.ShouldBindJSON(&input); err != nil || len(input.IDs) == 0 {
        c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
        return
    }

    ids := make([]uuid.UUID, len(input.IDs))
    for i, id := range input.IDs {
        uid, err := uuid.Parse(id)
        if err != nil {
            c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
            return
        }
        ids[i] = uid
    }

    tagIDs := make([]uuid.UUID, len(input.TagIDs))
    for i, t := range input.TagIDs {
        uid, err := uuid.Parse(t)
        if err != nil {
            c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
            return
        }
        tagIDs[i] = uid
    }

    if err := h.repo.BatchUpdateTags(ids, tagIDs); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}
```

- [ ] **Step 3: 注册路由**

在 `backend/cmd/server/main.go` 的 admin 路由组中添加：

```go
admin.POST("/media/batch-delete", mediaHandler.BatchDelete)
admin.POST("/media/batch-tag", mediaHandler.BatchUpdateTags)
```

#### Frontend

- [ ] **Step 4: 增强媒体管理页面**

在 `frontend/src/app/admin/media/page.tsx` 中添加：

**选中状态管理**：
```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

**每项添加 checkbox**：在 grid view 和 list view 的每个媒体项左上角添加 checkbox。

**顶栏批量操作按钮**（当有选中项时显示）：
- "全选" checkbox（切换全选/取消全选）
- 显示"已选择 N 项"
- "批量删除"按钮（弹出确认对话框，确认后调用 `api.admin.media.batchDelete(ids)`）
- "批量打标签"按钮（弹出标签选择弹窗，选择后调用 `api.admin.media.batchUpdateTags(ids, tagIds)`）

- [ ] **Step 5: 添加 API 调用**

在 `frontend/src/lib/api.ts` 的 admin.media 中添加：

```typescript
batchDelete: (ids: string[]) =>
    request('/api/v1/admin/media/batch-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
batchUpdateTags: (ids: string[], tagIds: string[]) =>
    request('/api/v1/admin/media/batch-tag', { method: 'POST', body: JSON.stringify({ ids, tag_ids: tagIds }) }),
```

---

### Task 8: 评论编辑历史

**Files:**
- Modify: `backend/internal/model/models.go`
- Modify: `backend/internal/handler/comment.go`
- Modify: `backend/internal/repository/repositories.go`
- Modify: `backend/cmd/server/main.go`
- Modify: `frontend/src/app/admin/comments/page.tsx`

**Interfaces:**
- Produces: `model.CommentRevision`, 编辑 endpoint, 前端编辑 UI
- Consumes: 已有 `Comment` 模型和 `CommentRepo`

#### Backend

- [ ] **Step 1: 添加 CommentRevision 模型和 Comment 字段扩展**

在 `backend/internal/model/models.go` 的 Comment 结构体中添加字段：

```go
type Comment struct {
    // ... 已有字段 ...
    EditedCount int        `gorm:"default:0" json:"edited_count,omitempty"`
    EditedAt    *time.Time `json:"edited_at,omitempty"`
}
```

添加新模型：

```go
type CommentRevision struct {
    ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    CommentID uuid.UUID `gorm:"type:uuid;index;not null" json:"comment_id"`
    Content   string    `gorm:"type:text;not null" json:"content"`
    EditedAt  time.Time `json:"edited_at"`
}
```

在 `AutoMigrate()` 中添加 `&CommentRevision{}`。

- [ ] **Step 2: 添加 CommentRevision 仓库方法**

在 `backend/internal/repository/repositories.go` 的 CommentRepo 中添加：

```go
func (r *CommentRepo) SaveRevision(commentID uuid.UUID, content string) error {
    return r.db.Create(&model.CommentRevision{
        CommentID: commentID,
        Content:   content,
        EditedAt:  time.Now(),
    }).Error
}

func (r *CommentRepo) ListRevisions(commentID uuid.UUID) ([]model.CommentRevision, error) {
    var items []model.CommentRevision
    err := r.db.Where("comment_id = ?", commentID).Order("edited_at DESC").Find(&items).Error
    return items, err
}

func (r *CommentRepo) UpdateContent(commentID uuid.UUID, content string) error {
    return r.db.Model(&model.Comment{}).Where("id = ?", commentID).
        Updates(map[string]interface{}{
            "content":      content,
            "edited_count": gorm.Expr("edited_count + 1"),
            "edited_at":    time.Now(),
        }).Error
}
```

- [ ] **Step 3: 添加编辑 endpoint**

在 `backend/internal/handler/comment.go` 的 CommentHandler 中添加：

```go
func (h *CommentHandler) AdminUpdate(c *gin.Context) {
    id, err := uuid.Parse(c.Param("id"))
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
        return
    }

    var input struct {
        Content string `json:"content" binding:"required"`
    }
    if err := c.ShouldBindJSON(&input); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "请输入评论内容"})
        return
    }

    // 获取原始评论保存为修订版本
    var comment model.Comment
    if err := h.db.First(&comment, id).Error; err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "评论不存在"})
        return
    }

    // 只保存内容有变化的编辑
    if comment.Content != input.Content {
        h.repo.SaveRevision(comment.ID, comment.Content)
        h.repo.UpdateContent(comment.ID, input.Content)
    }

    c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}

func (h *CommentHandler) ListRevisions(c *gin.Context) {
    id, err := uuid.Parse(c.Param("id"))
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
        return
    }
    revisions, err := h.repo.ListRevisions(id)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "获取失败"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"items": revisions})
}
```

- [ ] **Step 4: 注册路由**

在 `backend/cmd/server/main.go` 的 admin 路由组中添加：

```go
admin.PUT("/comments/:id", commentHandler.AdminUpdate)
admin.GET("/comments/:id/revisions", commentHandler.ListRevisions)
```

注意：这是对现有路由 `admin.DELETE("/comments/:id", ...)` 的补充。

#### Frontend

- [ ] **Step 5: 增强评论管理页面**

在 `frontend/src/app/admin/comments/page.tsx` 中添加：

**评论详情弹窗增强**：
- 在现有 detail modal 中添加"编辑"按钮
- 点击后显示文本编辑区域，预填当前评论内容
- "保存"按钮调用 `api.admin.comments.update(id, { content })`
- 成功后刷新列表

**编辑历史**：
- 在 detail modal 中添加"历史版本"标签页或按钮
- 调用 `api.admin.comments.revisions(id)`
- 显示历史版本列表（时间 + 内容），可展开查看

**已编辑标识**：
- 在评论列表行或 detail modal 中显示"已编辑 N 次"文字
- 显示最后编辑时间

- [ ] **Step 6: 添加 API 调用**

在 `frontend/src/lib/api.ts` 的 admin.comments 中添加：

```typescript
// 在 admin.comments 中
update: (id: string, data: { content: string }) =>
    request(`/api/v1/admin/comments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
revisions: (id: string) =>
    request<{ items: any[] }>(`/api/v1/admin/comments/${id}/revisions`),
```

---

## 实现顺序建议

考虑到任务间的依赖关系，推荐按以下顺序实现：

1. **Task 4（数据导出）** — 最简单，纯后端 CSV 导出 + 前端按钮，改动最小
2. **Task 6（媒体预览增强）** — 纯前端改动，独立无依赖
3. **Task 7（媒体批量操作）** — 后端 2 个 endpoint + 前端选中交互，独立
4. **Task 1（评论者管理/黑名单）** — 新模型+新 handler，依赖黑名单检查接入评论 Create
5. **Task 8（评论编辑历史）** — 新模型+编辑 endpoint，依赖评论详情弹窗
6. **Task 2（统计详情页）** — GeoIP 依赖需安装，新统计 endpoint + 前端页面
7. **Task 3（通知中心）** — 新模型+handler，需接入评论和友链的创建流程
8. **Task 5（日程日历）** — 简单后端 endpoint + 前端日历网格

各 Task 之间无代码依赖，可完全并行实现。

## 验证

1. `cd backend && go build ./...` 通过
2. `cd frontend && npm run build` 通过
3. 黑名单：封禁邮箱后该评论者无法提交评论（页面显示成功但实际不创建）
4. 统计页：显示国家分布（需 GeoIP 数据库）、来源排行、页面排行
5. 通知中心：有新评论或友链申请时，铃铛显示未读数
6. 数据导出：评论和友链页面点击导出下载 CSV 文件
7. 日历：按月显示已发布/草稿/定时文章
8. 媒体预览：视频可播放、音频有控制条
9. 媒体批量：多选后可批量删除和打标签
10. 评论编辑：编辑后显示"已编辑 X 次"，可查看历史版本
