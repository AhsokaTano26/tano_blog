# 图片馆（Photo Gallery）功能设计文档

> 为个人博客新增一个类似音乐馆的图片展示页面，采用瀑布流（Masonry）布局。

**Goal:** 在博客中新增独立图片馆页面，支持图片管理、瀑布流展示、灯箱浏览。

**Architecture:** 后端独立 `GalleryImage` 表，公开 API 返回按序排列的图片列表；前端 `/gallery` 采用 CSS columns 瀑布流布局，点击进入灯箱浏览；后台 `/admin/gallery` 提供完整 CRUD 和排序管理。

---

## 数据库模型（GalleryImage）

```go
type GalleryImage struct {
    ID          uuid.UUID  `gorm:"type:uuid;primaryKey"`
    URL         string     `gorm:"type:text;not null"`
    Title       string     `gorm:"type:varchar(255)"`
    Description string     `gorm:"type:text"`
    Width       int        `gorm:"default:0"`
    Height      int        `gorm:"default:0"`
    SortOrder   int        `gorm:"default:0;index"`
    CreatedAt   time.Time
    UpdatedAt   time.Time
}
```

- `url`: 图片地址，支持媒体库上传路径和外部 URL
- `width`/`height`: 原始宽高，用于 masonry 计算宽高比。媒体库上传自动读取，外部 URL 前端 fallback
- `sort_order`: 排序序号，越小越靠前

## 后端 API

### 公开接口

```
GET /api/v1/gallery
```

返回所有图片按 `sort_order` 升序排列，无需认证。

响应格式：
```json
{
  "items": [
    { "id": "uuid", "url": "...", "title": "...", "description": "...", "width": 1920, "height": 1080 }
  ]
}
```

### 管理端接口（需要 AuthRequired + CSRF + RoleRequired("admin")）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/gallery | 列表（同公开接口） |
| POST | /api/v1/admin/gallery | 新增图片 |
| PUT | /api/v1/admin/gallery/:id | 更新图片信息 |
| DELETE | /api/v1/admin/gallery/:id | 删除图片 |
| PUT | /api/v1/admin/gallery/reorder | 批量更新排序 |

**POST /api/v1/admin/gallery** 请求体：
```json
{
  "url": "https://...",
  "title": "日落",
  "description": "2024 年在洱海边拍的日落",
  "width": 1920,
  "height": 1080
}
```

**PUT /api/v1/admin/gallery/reorder** 请求体：
```json
{
  "items": [
    { "id": "uuid-1", "sort_order": 0 },
    { "id": "uuid-2", "sort_order": 1 }
  ]
}
```

## 前端页面

### 公开页 `/gallery`

**布局：** CSS columns 瀑布流
- PC（>1024px）：3-4 列
- 平板（640-1024px）：2-3 列
- 手机（<640px）：2 列

**交互流程：**
1. 页面加载 → fetch `/api/v1/gallery`
2. 每张图片按宽高比计算展示高度（若无宽高数据，默认取 1:1）
3. CSS `column-count` 自动排列瀑布流
4. 点击任意图片 → 打开全屏灯箱
5. 灯箱内：显示大图 + 标题 + 描述，左右切换（键盘/点击），Esc 关闭
6. hover 图片时显示半透明标题浮层

**风格：** 和音乐馆 `/music` 统一玻璃态设计语言。

**导航入口：** 网站顶部 Header 导航增加 `/gallery` 入口，与音乐馆并列显示

**复用组件：**
- `ImageLightbox` — 扩展支持接收任意图片列表参数

### 管理页 `/admin/gallery`

**布局：** 缩略图网格（3-4 列），每张卡片包含缩略图 + 标题 + 操作按钮

**功能：**
- 新增图片弹窗：
  - 输入 URL 或点击「媒体库」按钮（复用 `MediaPickerModal`）
  - 标题输入
  - 描述 textarea
  - 系统自动从媒体库获取宽高，外部 URL 留空
- 编辑弹窗：同新增
- 删除：确认后删除
- 排序：上下箭头按钮移动（批量更新 sort_order）

**导航：** 侧边栏「内容」分类下新增「图片馆」入口

## 修改文件清单

### 后端（新增 3 文件 + 修改 2 文件）

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/internal/model/gallery.go` | 新增 | GalleryImage 模型 |
| `backend/internal/handler/gallery.go` | 新增 | GalleryHandler（CRUD + reorder + list） |
| `backend/internal/repository/gallery.go` | 新增 | GalleryRepo |
| `backend/internal/model/models.go` | 修改 | AutoMigrate 注册 &GalleryImage |
| `backend/cmd/server/main.go` | 修改 | 初始化 GalleryRepo + GalleryHandler + 注册路由 |

### 前端（新增 2 文件 + 修改 3 文件）

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/app/gallery/page.tsx` | 新增 | 公开瀑布流页面 |
| `frontend/src/app/admin/gallery/page.tsx` | 新增 | 后台管理页面 |
| `frontend/src/lib/api.ts` | 修改 | 添加 gallery API 方法 |
| `frontend/src/components/Header.tsx` | 修改 | `defaultNavLinks` 添加「图片」入口 |
| `frontend/src/app/admin/layout.tsx` | 修改 | 侧边栏添加入口 |
| `frontend/src/app/globals.css` | 修改 | 添加瀑布流相关样式 |

## 验证方法

1. 启动后端：`cd backend && go run ./cmd/server`
2. 启动前端：`cd frontend && npm run dev`
3. 后台 → 侧边栏「图片馆」→ 新增几张图片（媒体库选择 + 外部 URL）
4. 调整排序，确认能正确保存
5. 访问 `/gallery` → 瀑布流正常展示
6. 点击图片 → 灯箱打开，左右切换正常
7. 手机视口下自适应列数正常
8. `npm run build` 无报错
