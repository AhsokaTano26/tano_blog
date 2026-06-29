# 博客互动增强功能设计文档

> 在现有博客基础上增加 7 个功能：上一篇/下一篇导航、标签匹配推荐、评论 Spam 筛选、标签云、评论预览、评论表情反应、文章系列/合集

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React + Next.js 14 (App Router) + Tailwind CSS |
| 后端 | Go 1.22+ + Gin + GORM |
| 数据库 | PostgreSQL 16（新增 series / post_series / comment_reactions 表） |

---

## 一、文章系列 / 合集

### 1.1 数据模型

新增 `series` 表：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| name | VARCHAR(200) | 系列名称 |
| slug | VARCHAR(200) UNIQUE | URL slug |
| description | TEXT | 系列描述 |
| cover_image | VARCHAR(500) | 封面图 |
| sort_order | INT DEFAULT 0 | 排序权重 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

新增 `post_series` 关联表：

| 字段 | 类型 | 说明 |
|------|------|------|
| series_id | UUID PK, FK → series | 系列 ID |
| post_id | UUID PK, FK → posts | 文章 ID |
| sort_order | INT DEFAULT 0 | 文章在系列中的顺序 |

- Post 模型增加 `Series` 字段（*Series），序列化为 `json:"series,omitempty"`
- Post 列表/详情返回体中包含 series 信息

### 1.2 后端 API

**管理端（需 admin + CSRF）：**
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/series | 系列列表 |
| POST | /api/v1/admin/series | 创建系列 |
| PUT | /api/v1/admin/series/:id | 更新系列 |
| DELETE | /api/v1/admin/series/:id | 删除系列 |
| GET | /api/v1/admin/series/:id/posts | 系列内文章列表 |
| PUT | /api/v1/admin/series/:id/posts | 更新系列内文章（批量设顺序） |

**公开：**
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/series | 系列列表（含文章数） |
| GET | /api/v1/series/:slug | 系列详情（含文章列表） |

### 1.3 前端

- **后台**：`/admin/series` — 列表 + 新建/编辑弹窗，选文章并拖拽排序
- **前台**：`/series/[slug]` — 系列落地页，按 sort_order 展示文章
- **文章编辑页**：增加"所属系列"下拉选择 + 序号输入
- **文章详情**：标题下方 `系列名 · 第 N 篇`；底部显示系列内上一篇/下一篇导航

---

## 二、评论表情反应

### 2.1 数据模型

新增 `comment_reactions` 表：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| comment_id | UUID FK → comments | 评论 ID |
| emoji | VARCHAR(10) | 预设表情字符 |
| ip_address | VARCHAR(45) | 用户 IP |
| created_at | TIMESTAMP | 创建时间 |

唯一索引：`(comment_id, ip_address, emoji)` — 同一用户对同一评论的同一表情只能点一次（切换操作）

预设表情列表：`["👍", "❤️", "😂", "😮", "😢", "🙏"]`

### 2.2 后端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/posts/:slug/comments/:id/reactions | 切换表情反应 |
| DELETE | /api/v1/posts/:slug/comments/:id/reactions | 取消反应（可选，POST 已支持切换） |

- 公开评论列表接口返回体中增加 `reactions` 字段及当前用户已选的 emoji

### 2.3 前端

- 每条评论下方显示 6 个表情按钮
- 已选高亮 + 计数
- 点击切换选中/取消（即时反馈）

---

## 三、评论实时预览

纯前端改动。

- 评论框下方增加"预览"切换开关
- 开启后在评论框下方实时渲染 Markdown
- 使用现有 `react-markdown` + `remark-gfm` 管道
- 预览区域固定高度（200px），超出滚动

---

## 四、评论区 Spam 筛选标签

极简改动。Comment 模型已有 `spam` 状态。

- 评论管理页 tab 行增加 "spam（垃圾）"
- 后端 `?status=spam` 已支持，无需后端改动

---

## 五、标签云

### 5.1 后端

- `GET /api/v1/tags` 返回体中每项增加 `post_count` 字段
- Repository 新增 `TagPostCount` 方法（按 tag_id 分组 COUNT）

### 5.2 前端

- 侧边栏标签列表改为标签云样式
- 字体大小按文章数量分档：最少 12px，最多 24px
- 颜色按数量分 3 档（浅/中/深）
- 前端计算分档逻辑，无需后端额外数据

---

## 六、猜你喜欢（标签匹配推荐）

### 6.1 后端

- 已有 `GET /api/v1/posts/top-viewed`，**新增** `GET /api/v1/posts/:slug/related`
- 逻辑：取文章标签 ID → 找包含这些标签的其他已发布文章 → 按匹配标签数量 DESC → LIMIT 6
- 排除当前文章

### 6.2 前端

- 文章详情底部"相关文章"区域（替代现有同分类推荐）
- 横向卡片展示，最多 6 篇，含封面图 + 标题 + 标签

---

## 七、上一篇 / 下一篇导航

### 7.1 后端

- `GET /api/v1/posts/:slug/adjacent` → 返回 `{ prev: {...}, next: {...} }`
- 按 `published_at` 找前后篇
- 或在文章详情接口中直接返回（省一次请求）

### 7.2 前端

- 文章详情底部，相关文章上方
- 左对齐"← 上一篇"，右对齐"下一篇 →"
- 无则隐藏

---

## 分类总表

| 模块 | 新增表 | 后端文件 | 前端文件 |
|------|--------|---------|---------|
| 文章系列 | series, post_series | handler/series.go, repository/series.go, model/models.go | /admin/series/page.tsx, /series/[slug]/page.tsx, posts/[slug] 改造 |
| 表情反应 | comment_reactions | handler/comment.go 扩展, repository/comment.go 扩展, model/models.go | components/Comment.tsx 改造 |
| 评论预览 | 无 | 无 | components/CommentForm.tsx 改造 |
| Spam 标签 | 无 | 无 | admin/comments/page.tsx tab 增加 |
| 标签云 | 无 | handler/tag.go 扩展, repository/tag.go 扩展 | components/TagCloud.tsx 新建 |
| 猜你喜欢 | 无 | handler/post.go 扩展, repository/post.go 扩展 | posts/[slug] 相关区域改造 |
| 上一篇/下一篇 | 无 | handler/post.go 扩展, repository/post.go 扩展 | posts/[slug] 底部导航 |
