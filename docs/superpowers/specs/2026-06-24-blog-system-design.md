# 个人博客系统设计文档

> 参考站点：https://tano.asia

## 1. 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Next.js 14 (App Router) + TypeScript |
| CSS | Tailwind CSS |
| 后端 | Go 1.22+ + Gin |
| ORM | GORM |
| 数据库 | PostgreSQL 16 |
| 认证 | JWT + TOTP (RFC 6238) + Passkey (WebAuthn) |
| 容器化 | Docker Compose |
| 地理 IP | MaxMind GeoLite2（可选嵌入或外部文件） |

## 2. 架构

前后端分离架构：

- **Next.js 前端**：负责前台 SSR 渲染（SEO 友好）和后台管理页面（CSR）
- **Go + Gin 后端**：提供 REST API，处理业务逻辑、认证、文件上传
- **PostgreSQL**：持久化存储

```
┌─────────────────────────────────────────────────┐
│              Next.js Frontend                    │
│  ┌─────────────────┐  ┌───────────────────────┐  │
│  │   前台博客        │  │   后台管理系统         │  │
│  │   (SSR)          │  │   (CSR)               │  │
│  │   /              │  │   /admin/*            │  │
│  │   /posts/[slug]  │  │                       │  │
│  │   /gallery       │  │   23+ 管理页面         │  │
│  │   /music         │  │                       │  │
│  │   /series/[slug] │  │                       │  │
│  │   /links         │  │                       │  │
│  │   /calendar      │  │                       │  │
│  └────────┬─────────┘  └───────────┬───────────┘  │
└───────────┼────────────────────────┼──────────────┘
            │ REST API               │
┌───────────▼────────────────────────▼──────────────┐
│              Go + Gin Backend                      │
│  /api/v1/auth            认证                      │
│  /api/v1/posts           文章（含评论/相关/相邻）  │
│  /api/v1/categories      分类                      │
│  /api/v1/tags            标签（含 post_count）     │
│  /api/v1/comments        评论 + 表情反应           │
│  /api/v1/series          文章系列                  │
│  /api/v1/gallery         图片馆                    │
│  /api/v1/links           友链                      │
│  /api/v1/nav-links       导航链接                  │
│  /api/v1/upload          文件上传                  │
│  /api/v1/site            站点配置                  │
│  /api/v1/notifications   通知                      │
│  /api/v1/admin/*         管理后台 API              │
│  /api/v1/admin/ip-bans   IP 封禁管理               │
│  /api/v1/admin/backups   备份管理                  │
│  /api/v1/admin/access-logs  审计日志 + 统计        │
│                                                   │
│  中间件链: AccessLog → CORS → Security → IPBan    │
└───────────────────┬───────────────────────────────┘
                    │
┌───────────────────▼───────────────────────────────┐
│                 PostgreSQL                         │
│  users | passkeys | posts | categories | tags     │
│  post_tags | comments | comment_reactions         │
│  media | media_tags | media_tag_links             │
│  series | post_series                              │
│  post_revisions | comment_revisions               │
│  post_reactions | comment_reactions               │
│  site_config | access_logs                        │
│  ip_bans | friend_links | nav_links               │
│  notifications | gallery_images                   │
└───────────────────────────────────────────────────┘
```

## 3. 项目目录结构

```
tano_blog/
├── frontend/                  # Next.js 前端
│   ├── src/
│   │   ├── app/
│   │   │   ├── (blog)/        # 前台博客（路由组）
│   │   │   │   ├── page.tsx           # 首页（文章卡片列表）
│   │   │   │   ├── posts/[slug]/      # 文章详情（评论、赞、相关、相邻）
│   │   │   │   ├── categories/[slug]/ # 分类页
│   │   │   │   ├── tags/[slug]/       # 标签页
│   │   │   │   ├── archive/           # 归档页
│   │   │   │   ├── search/            # 全文搜索
│   │   │   │   ├── about/             # 关于页
│   │   │   │   ├── series/[slug]/     # 文章系列页
│   │   │   │   ├── links/             # 友链页
│   │   │   │   ├── calendar/          # 日历页
│   │   │   │   └── layout.tsx         # 博客布局（侧边栏）
│   │   │   ├── gallery/       # 图片馆（瀑布流 + 灯箱）
│   │   │   ├── music/         # 音乐馆
│   │   │   ├── admin/         # 后台管理（CSR, 23+ 页面）
│   │   │   │   ├── login/             # 登录（密码/TOTP/Passkey）
│   │   │   │   ├── forgot-password/   # 忘记密码
│   │   │   │   ├── reset-password/    # 重置密码
│   │   │   │   ├── page.tsx           # 仪表盘（访问统计概览）
│   │   │   │   ├── posts/             # 文章管理（含 Markdown 编辑器）
│   │   │   │   ├── categories/        # 分类 CRUD
│   │   │   │   ├── tags/              # 标签 CRUD
│   │   │   │   ├── comments/          # 评论审核（含 spam 标签）
│   │   │   │   ├── media/             # 媒体库（含标签管理）
│   │   │   │   ├── access-logs/       # 审计日志查看
│   │   │   │   ├── analytics/         # 详细统计分析
│   │   │   │   ├── blocked/           # IP 封禁（手动 + 自动配置）
│   │   │   │   ├── settings/          # 站点设置 + 备份恢复
│   │   │   │   ├── backup/            # 备份管理
│   │   │   │   ├── profile/           # 个人资料
│   │   │   │   ├── series/            # 文章系列管理
│   │   │   │   ├── nav-links/         # 导航链接管理
│   │   │   │   ├── links/             # 友链管理
│   │   │   │   ├── gallery/           # 图片馆管理
│   │   │   │   ├── music-page/        # 音乐馆管理
│   │   │   │   ├── notifications/     # 通知管理
│   │   │   │   ├── calendar/          # 日历视图
│   │   │   │   ├── help/              # 使用帮助
│   │   │   │   └── layout.tsx         # 管理后台布局（侧边栏导航）
│   │   │   └── layout.tsx     # 根布局
│   │   ├── components/        # 通用组件
│   │   │   ├── CommentForm.tsx        # 评论表单（含实时预览）
│   │   │   ├── CommentCard.tsx        # 评论卡片（含表情反应按钮）
│   │   │   ├── Loading.tsx            # 加载状态
│   │   │   ├── ConfirmDialog.tsx      # 确认对话框
│   │   │   ├── ImageLightbox.tsx      # 图片灯箱
│   │   │   ├── MediaPickerModal.tsx   # 媒体选择器
│   │   │   ├── TagCloud.tsx           # 标签云组件
│   │   │   └── Header.tsx             # 导航头部（含动态 nav-links）
│   │   ├── lib/
│   │   │   └── api.ts        # API 客户端（所有后端接口封装）
│   │   └── styles/            # 全局样式
│   ├── public/                # 静态资源
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                   # Go 后端
│   ├── cmd/
│   │   └── server/
│   │       └── main.go        # 入口：路由、初始化、中间件链
│   ├── internal/
│   │   ├── config/
│   │   │   └── config.go      # 配置加载（环境变量）
│   │   ├── handler/           # HTTP 处理器
│   │   │   ├── auth.go               # 认证（密码/TOTP/Passkey/Profile）
│   │   │   ├── post.go               # 文章 CRUD + 相关/相邻/日历/导出
│   │   │   ├── category_tag.go       # 分类 & 标签
│   │   │   ├── comment.go            # 评论 + 审核 + 反应 + 修订
│   │   │   ├── media.go              # 媒体库 + 标签 + 批量操作
│   │   │   ├── series.go             # 文章系列 CRUD
│   │   │   ├── gallery.go            # 图片馆 CRUD + 排序
│   │   │   ├── ip_ban.go             # IP 封禁 + 自动封禁配置
│   │   │   ├── failed_login.go       # 登录失败内存计数器
│   │   │   ├── config_accesslog.go   # 站点配置 + 审计日志 + 统计
│   │   │   ├── nav_link.go           # 导航链接 CRUD + 排序
│   │   │   ├── friend_link.go        # 友链 CRUD + 申请 + 导出
│   │   │   ├── notification.go       # 通知列表 + 已读
│   │   │   ├── backup.go             # 备份创建/下载/恢复/清理
│   │   │   ├── feed.go               # RSS/Sitemap 生成
│   │   │   └── ai.go                 # AI 摘要生成
│   │   ├── middleware/        # 中间件
│   │   │   ├── auth.go               # JWT 认证、CSRF、角色检查
│   │   │   ├── cors.go               # CORS
│   │   │   ├── ratelimit.go          # 速率限制（内存滑动窗口）
│   │   │   ├── access_log.go         # 审计日志记录
│   │   │   └── ip_ban.go             # IP 封禁检查（按模块路径匹配）
│   │   ├── model/
│   │   │   ├── models.go             # 所有 GORM 模型 + AutoMigrate
│   │   │   └── gallery.go            # GalleryImage 独立模型
│   │   ├── repository/
│   │   │   ├── repositories.go       # 所有仓库实现
│   │   │   ├── series.go             # SeriesRepo
│   │   │   ├── gallery.go            # GalleryRepo
│   │   │   └── notification.go       # NotificationRepo
│   │   ├── service/
│   │   │   ├── email.go              # 邮件发送
│   │   │   ├── email_templates.go    # 邮件模板
│   │   │   └── ai.go                 # AI 服务（调用外部 LLM）
│   │   ├── utils/
│   │   │   ├── geoip.go              # GeoIP 位置查询（嵌入 + 外部覆盖）
│   │   │   ├── geoipdata/            # 嵌入的 .mmdb 数据库文件
│   │   │   ├── jwt.go                # JWT 签发验证
│   │   │   ├── totp.go               # TOTP 工具
│   │   │   ├── passkey.go            # WebAuthn 辅助
│   │   │   ├── crypto.go             # 加解密工具
│   │   │   └── logger.go             # 结构化日志
│   │   └── version/
│   │       └── version.go            # 编译版本信息
│   ├── go.mod
│   └── go.sum
│
├── docs/superpowers/
│   ├── specs/                 # 功能设计文档
│   │   ├── 2026-06-24-blog-system-design.md       # 本文件（系统总设计）
│   │   ├── 2026-06-29-backup-restore-design.md    # 备份恢复
│   │   ├── 2026-06-30-engagement-features-design.md # 互动增强
│   │   └── 2026-07-14-gallery-design.md           # 图片馆
│   └── plans/                 # 实施计划
│       ├── 2026-06-29-backup-restore.md
│       ├── 2026-06-30-engagement-features.md
│       ├── 2026-07-07-admin-enhancements.md
│       └── 2026-07-14-gallery.md
│
├── docker-compose.yml
└── README.md
```

## 4. 数据库设计

### 4.1 用户表 (users)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| username | VARCHAR(50) | 用户名，唯一 |
| email | VARCHAR(255) | 邮箱，唯一 |
| password_hash | VARCHAR(255) | bcrypt 哈希密码 |
| display_name | VARCHAR(100) | 显示名称 |
| avatar_url | VARCHAR(500) | 头像 URL |
| bio | TEXT | 个人简介 |
| totp_secret | VARCHAR(100) | TOTP 密钥 |
| totp_enabled | BOOLEAN | 是否启用 TOTP |
| role | VARCHAR(20) | 角色，默认 'admin' |
| force_password_change | BOOLEAN | 是否强制改密 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 4.2 Passkey 表 (passkeys)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | 关联用户 |
| credential_id | VARCHAR(500) | WebAuthn 凭证 ID，唯一 |
| public_key | BYTEA | 公钥 |
| sign_count | BIGINT | 签名计数 |
| aaguid | VARCHAR(100) | 认证器 AAGUID |
| nickname | VARCHAR(100) | 设备名称 |
| created_at | TIMESTAMP | 创建时间 |

### 4.3 分类表 (categories)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| name | VARCHAR(100) | 分类名，唯一 |
| slug | VARCHAR(100) | URL slug，唯一 |
| description | TEXT | 描述 |
| sort_order | INT | 排序权重 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 4.4 标签表 (tags)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| name | VARCHAR(100) | 标签名，唯一 |
| slug | VARCHAR(100) | URL slug，唯一 |
| created_at | TIMESTAMP | 创建时间 |

### 4.5 文章表 (posts)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| title | VARCHAR(500) | 标题 |
| slug | VARCHAR(500) | URL slug，唯一 |
| content | TEXT | Markdown 内容 |
| excerpt | VARCHAR(1000) | 摘要 |
| cover_image | VARCHAR(500) | 封面图 URL |
| status | VARCHAR(20) | draft/published |
| is_top | BOOLEAN | 是否置顶 |
| allow_comment | BOOLEAN | 是否允许评论 |
| view_count | BIGINT | 浏览次数 |
| category_id | UUID | 关联分类 |
| author_id | UUID | 关联作者 |
| published_at | TIMESTAMP | 发布时间 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 4.6 文章-标签关联表 (post_tags)

| 字段 | 类型 | 说明 |
|------|------|------|
| post_id | UUID | 关联文章，级联删除 |
| tag_id | UUID | 关联标签，级联删除 |

联合主键：(post_id, tag_id)

### 4.7 评论表 (comments)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| post_id | UUID | 关联文章，级联删除 |
| parent_id | UUID | 父评论 ID（NULL 为顶级） |
| nickname | VARCHAR(100) | 评论者昵称 |
| email | VARCHAR(255) | 评论者邮箱（不公开） |
| website | VARCHAR(500) | 评论者网站 |
| content | TEXT | 评论内容 |
| status | VARCHAR(20) | pending/approved/rejected/spam |
| ip_address | VARCHAR(45) | IP 地址 |
| user_agent | VARCHAR(500) | User-Agent |
| fingerprint | VARCHAR(255) | 浏览器指纹 |
| country | VARCHAR(100) | 国家 |
| city | VARCHAR(100) | 城市 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 4.8 媒体文件表 (media)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| filename | VARCHAR(500) | 存储文件名 |
| original_name | VARCHAR(500) | 原始文件名 |
| mime_type | VARCHAR(100) | MIME 类型 |
| size | BIGINT | 文件大小（字节） |
| url | VARCHAR(1000) | 访问 URL |
| alt_text | VARCHAR(500) | 替代文本 |
| width | INT | 图片宽度（自动读取） |
| height | INT | 图片高度（自动读取） |
| duration | DOUBLE | 音频/视频时长（秒） |
| uploaded_by | UUID | 上传者 |
| created_at | TIMESTAMP | 创建时间 |

### 4.9 站点配置表 (site_config)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| key | VARCHAR(100) | 配置键，唯一 |
| value | TEXT | 配置值 |
| type | VARCHAR(20) | string/bool/int/json |

预置配置项：site_title, site_description, site_url, logo_url, favicon_url, footer_text, icp_number, ga_code, comment_enabled, default_theme, accent_color

自动封禁配置项（动态管理）：ip_ban_auto_enabled, ip_ban_auto_threshold, ip_ban_auto_window, ip_ban_auto_scope, ip_ban_auto_duration

### 4.10 访问日志表 (access_logs)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| ip_address | VARCHAR(45) | IP 地址 |
| user_agent | VARCHAR(1000) | User-Agent |
| method | VARCHAR(10) | HTTP 方法 |
| path | VARCHAR(1000) | 请求路径 |
| query_params | TEXT | 查询参数 |
| status_code | INT | HTTP 状态码 |
| response_time | INT | 响应时间(ms) |
| referer | VARCHAR(1000) | 来源页 |
| country | VARCHAR(100) | 国家 |
| city | VARCHAR(100) | 城市 |
| device_type | VARCHAR(50) | desktop/mobile/tablet |
| browser | VARCHAR(100) | 浏览器 |
| os | VARCHAR(100) | 操作系统 |
| user_id | UUID | 登录用户（可选） |
| session_id | VARCHAR(255) | 会话标识 |
| created_at | TIMESTAMP | 创建时间，NOT NULL |

索引：created_at, ip_address, path, user_id

### 4.11 IP 封禁表 (ip_bans)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| ip_address | VARCHAR(45) | IP 地址，已索引 |
| scope | VARCHAR(100) | 逗号分隔的模块标识符 |
| reason | VARCHAR(500) | 封禁原因 |
| auto_ban | BOOLEAN | 是否自动封禁 |
| expires_at | TIMESTAMP | 过期时间（NULL 为永久） |
| created_by | UUID | 管理员 ID |
| created_at | TIMESTAMP | 创建时间 |

可用 scope 值：`post`, `comment`, `category`, `tag`, `series`, `link`, `gallery`, `music`, `search`, `login`, `site`（全站）

### 4.12 文章系列表 (series)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| name | VARCHAR(200) | 系列名称 |
| slug | VARCHAR(200) | URL slug，唯一 |
| description | TEXT | 系列描述 |
| cover_image | VARCHAR(500) | 封面图 |
| sort_order | INT | 排序权重 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 4.13 文章-系列关联表 (post_series)

| 字段 | 类型 | 说明 |
|------|------|------|
| series_id | UUID | 关联系列 |
| post_id | UUID | 关联文章 |
| sort_order | INT | 文章在系列中的顺序 |

联合主键：(series_id, post_id)

### 4.14 评论反应表 (comment_reactions)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| comment_id | UUID | 关联评论 |
| emoji | VARCHAR(10) | 预设表情字符 |
| ip_address | VARCHAR(45) | 用户 IP |
| created_at | TIMESTAMP | 创建时间 |

唯一索引：(comment_id, ip_address, emoji) — 同一用户对同一评论的同一表情只能点一次

预设表情：`["👍", "❤️", "😂", "😮", "😢", "🙏"]`

### 4.15 文章反应表 (post_reactions)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| post_id | UUID | 关联文章 |
| emoji | VARCHAR(10) | 表情字符 |
| ip_address | VARCHAR(45) | 用户 IP |
| created_at | TIMESTAMP | 创建时间 |

唯一索引：(post_id, ip_address, emoji)

### 4.16 文章修订表 (post_revisions)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| post_id | UUID | 关联文章 |
| title | VARCHAR(500) | 修订标题 |
| content | TEXT | 修订内容 |
| excerpt | VARCHAR(1000) | 修订摘要 |
| cover_image | VARCHAR(500) | 修订封面 |
| status | VARCHAR(20) | 修订时文章状态 |
| category_id | UUID | 修订时分类 |
| created_by | UUID | 操作者 |
| created_at | TIMESTAMP | 创建时间 |

### 4.17 评论修订表 (comment_revisions)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| comment_id | UUID | 关联评论 |
| content | TEXT | 修订内容 |
| status | VARCHAR(20) | 修订时状态 |
| created_by | UUID | 操作者 |
| created_at | TIMESTAMP | 创建时间 |

### 4.18 友链表 (friend_links)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| name | VARCHAR(200) | 站点名称 |
| url | VARCHAR(500) | 站点 URL |
| description | VARCHAR(500) | 描述 |
| logo | VARCHAR(500) | Logo URL |
| email | VARCHAR(255) | 联系邮箱（用于申请） |
| status | VARCHAR(20) | pending/approved/rejected |
| sort_order | INT | 排序权重 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 4.19 导航链接表 (nav_links)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| label | VARCHAR(100) | 显示名称 |
| href | VARCHAR(500) | 链接地址 |
| icon | VARCHAR(50) | 图标名（可选） |
| sort_order | INT | 排序权重 |
| is_new_tab | BOOLEAN | 是否新标签打开 |
| created_at | TIMESTAMP | 创建时间 |

### 4.20 通知表 (notifications)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | 接收用户 |
| type | VARCHAR(50) | 通知类型 |
| title | VARCHAR(500) | 通知标题 |
| content | TEXT | 通知内容 |
| link | VARCHAR(500) | 关联链接 |
| is_read | BOOLEAN | 是否已读 |
| created_at | TIMESTAMP | 创建时间 |

### 4.21 图片馆表 (gallery_images)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| url | TEXT | 图片地址（支持媒体库或外部 URL） |
| title | VARCHAR(255) | 标题 |
| description | TEXT | 描述 |
| width | INT | 原始宽度（用于瀑布流计算） |
| height | INT | 原始高度 |
| sort_order | INT | 排序序号 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

## 5. API 设计

### 5.1 认证 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/v1/auth/login | 用户名+密码登录 | 否 (限流) |
| POST | /api/v1/auth/login/totp | TOTP 两步验证 | 否 (限流) |
| POST | /api/v1/auth/logout | 登出 | 是 |
| GET | /api/v1/auth/me | 获取当前用户 | 是 |
| PUT | /api/v1/auth/profile | 更新个人资料 | 是 |
| PUT | /api/v1/auth/password | 修改密码 | 是 |
| POST | /api/v1/auth/forgot-password | 忘记密码 | 否 (限流) |
| POST | /api/v1/auth/reset-password | 重置密码 | 否 (限流) |
| POST | /api/v1/auth/totp/setup | 生成 TOTP 二维码 | 是 |
| POST | /api/v1/auth/totp/verify | 验证并启用 TOTP | 是 (限流) |
| DELETE | /api/v1/auth/totp | 禁用 TOTP | 是 |
| POST | /api/v1/auth/passkey/register/options | Passkey 注册选项 | 是 |
| POST | /api/v1/auth/passkey/register/verify | Passkey 注册验证 | 是 |
| POST | /api/v1/auth/passkey/login/options | Passkey 登录选项 | 否 (限流) |
| POST | /api/v1/auth/passkey/login/verify | Passkey 登录验证 | 否 (限流) |
| DELETE | /api/v1/auth/passkey/:id | 删除 Passkey | 是 |
| PUT | /api/v1/auth/passkey/:id/rename | 重命名 Passkey | 是 |
| GET | /api/v1/auth/passkeys | 列出 Passkeys | 是 |

### 5.2 文章 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/posts | 文章列表（分页、筛选） | 否 |
| GET | /api/v1/posts/top | 置顶文章 | 否 |
| GET | /api/v1/posts/top-viewed | 热门文章 | 否 |
| GET | /api/v1/posts/:slug | 文章详情（系列信息） | 否 (可选认证) |
| GET | /api/v1/posts/:slug/adjacent | 上一篇/下一篇 | 否 |
| GET | /api/v1/posts/:slug/related | 猜你喜欢（标签匹配） | 否 |
| GET | /api/v1/posts/calendar | 日历文章列表 | 否 |
| GET | /api/v1/posts/preview | 预览令牌 | 否 (限流) |
| POST | /api/v1/posts/:slug/verify-password | 验证密码文章 | 否 (限流) |
| POST | /api/v1/posts/:slug/reactions | 切换文章表情反应 | 否 (限流) |
| GET | /api/v1/archive | 归档（按年月） | 否 |

### 5.3 分类 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/categories | 分类列表 | 否 |
| GET | /api/v1/categories/:slug | 分类详情+文章 | 否 |

### 5.4 标签 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/tags | 标签列表（含 post_count） | 否 |
| GET | /api/v1/tags/:slug | 标签详情+文章 | 否 |

### 5.5 评论 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/posts/:slug/comments | 文章评论列表（含 reactions） | 否 |
| POST | /api/v1/posts/:slug/comments | 提交评论 | 否 (限流) |
| POST | /api/v1/posts/:slug/comments/:id/reactions | 切换表情反应 | 否 (限流) |

### 5.6 文章系列 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/series | 系列列表（含文章数） | 否 |
| GET | /api/v1/series/:slug | 系列详情（含文章列表） | 否 |

### 5.7 图片馆 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/gallery | 图片列表（按 sort_order 排序） | 否 |

### 5.8 友链 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/links | 友链列表（已审核） | 否 |
| POST | /api/v1/links/apply | 申请友链 | 否 (限流) |

### 5.9 导航链接 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/nav-links | 导航链接列表（按 sort_order） | 否 |

### 5.10 媒体 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/media/info | 获取媒体元信息 | 否 |

### 5.11 通知 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/notifications | 通知列表 | 是 |
| GET | /api/v1/notifications/unread-count | 未读数 | 是 |
| PATCH | /api/v1/notifications/:id/read | 标记已读 | 是 |
| PATCH | /api/v1/notifications/read-all | 全部已读 | 是 |

### 5.12 站点配置 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/config/public | 公开配置 | 否 |

### 5.13 管理后台 API（需 Auth + CSRF + Admin）

#### 文章管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/posts | 文章管理列表 |
| GET | /api/v1/admin/posts/:id | 文章详情（管理端） |
| POST | /api/v1/admin/posts | 创建文章 |
| PUT | /api/v1/admin/posts/:id | 更新文章 |
| DELETE | /api/v1/admin/posts/:id | 删除文章 |
| PATCH | /api/v1/admin/posts/:id/status | 修改状态 |
| PATCH | /api/v1/admin/posts/:id/top | 置顶/取消 |
| POST | /api/v1/admin/posts/batch-status | 批量修改状态 |
| POST | /api/v1/admin/posts/batch-delete | 批量删除 |
| GET | /api/v1/admin/posts/:id/revisions | 修订历史 |
| POST | /api/v1/admin/posts/:id/revisions/:revId/restore | 恢复修订 |
| POST | /api/v1/admin/posts/:id/preview-token | 生成预览令牌 |
| POST | /api/v1/admin/posts/:id/generate-excerpt | AI 生成摘要 |
| GET | /api/v1/admin/posts/calendar | 日历文章数据 |
| GET | /api/v1/admin/posts/export | 导出文章 |

#### 分类管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/categories | 分类列表 |
| POST | /api/v1/admin/categories | 创建分类 |
| PUT | /api/v1/admin/categories/:id | 更新分类 |
| DELETE | /api/v1/admin/categories/:id | 删除分类 |

#### 标签管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/tags | 标签列表 |
| POST | /api/v1/admin/tags | 创建标签 |
| PUT | /api/v1/admin/tags/:id | 更新标签 |
| DELETE | /api/v1/admin/tags/:id | 删除标签 |

#### 评论管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/comments | 评论列表（含筛选） |
| PATCH | /api/v1/admin/comments/:id/status | 审核状态 |
| PATCH | /api/v1/admin/comments/batch-status | 批量审核 |
| DELETE | /api/v1/admin/comments/:id | 删除评论 |
| PUT | /api/v1/admin/comments/:id | 编辑评论 |
| GET | /api/v1/admin/comments/:id/revisions | 评论修订历史 |
| GET | /api/v1/admin/comments/export | 导出评论 CSV |

#### IP 封禁管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/ip-bans | 封禁列表（分页） |
| POST | /api/v1/admin/ip-bans | 创建封禁 |
| DELETE | /api/v1/admin/ip-bans/:id | 解封 |
| GET | /api/v1/admin/ip-bans/config | 获取自动封禁配置 |
| PUT | /api/v1/admin/ip-bans/config | 更新自动封禁配置 |

#### 媒体管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/media | 媒体库列表 |
| POST | /api/v1/admin/upload | 上传文件 |
| DELETE | /api/v1/admin/media/:id | 删除媒体 |
| PUT | /api/v1/admin/media/:id/tags | 更新媒体标签 |
| PUT | /api/v1/admin/media/:id/metadata | 更新元信息 |
| GET | /api/v1/admin/media/tags | 媒体标签列表 |
| POST | /api/v1/admin/media/tags | 创建媒体标签 |
| DELETE | /api/v1/admin/media/tags/:id | 删除媒体标签 |
| POST | /api/v1/admin/media/batch-delete | 批量删除 |
| POST | /api/v1/admin/media/batch-tag | 批量打标签 |

#### 文章系列管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/series | 系列列表 |
| POST | /api/v1/admin/series | 创建系列 |
| PUT | /api/v1/admin/series/:id | 更新系列 |
| DELETE | /api/v1/admin/series/:id | 删除系列 |
| GET | /api/v1/admin/series/:id/posts | 系列内文章列表 |
| PUT | /api/v1/admin/series/:id/posts | 设置系列内文章 |

#### 图片馆管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/gallery | 图片列表 |
| POST | /api/v1/admin/gallery | 新增图片 |
| PUT | /api/v1/admin/gallery/:id | 更新图片 |
| DELETE | /api/v1/admin/gallery/:id | 删除图片 |
| PUT | /api/v1/admin/gallery/reorder | 批量排序 |
| POST | /api/v1/admin/gallery/toggle | 切换图片状态 |

#### 友链管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/links | 友链列表 |
| POST | /api/v1/admin/links | 创建友链 |
| PUT | /api/v1/admin/links/:id | 更新友链 |
| PATCH | /api/v1/admin/links/:id/status | 审核状态 |
| DELETE | /api/v1/admin/links/:id | 删除友链 |
| GET | /api/v1/admin/links/export | 导出 CSV |

#### 导航链接管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/nav-links | 列表 |
| POST | /api/v1/admin/nav-links | 创建 |
| PUT | /api/v1/admin/nav-links/:id | 更新 |
| DELETE | /api/v1/admin/nav-links/:id | 删除 |
| PUT | /api/v1/admin/nav-links/reorder | 排序 |

#### 站点配置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/config | 获取所有配置 |
| PUT | /api/v1/admin/config | 更新配置 |
| POST | /api/v1/admin/config/test-email | 测试邮件 |
| GET | /api/v1/admin/check-version | 检查新版本 |

#### 用户管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/users | 用户列表 |

#### 审计日志

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/access-logs | 日志列表（分页、筛选） |
| GET | /api/v1/admin/access-logs/stats | 访问统计 |
| GET | /api/v1/admin/access-logs/stats/device | 设备统计 |
| GET | /api/v1/admin/access-logs/stats/browser | 浏览器统计 |
| GET | /api/v1/admin/access-logs/stats/os | 操作系统统计 |
| GET | /api/v1/admin/access-logs/stats/hour | 小时分布 |
| GET | /api/v1/admin/access-logs/stats/country | 国家分布 |
| GET | /api/v1/admin/access-logs/stats/referrer | 来源统计 |
| GET | /api/v1/admin/access-logs/stats/path | 路径统计 |
| GET | /api/v1/admin/access-logs/stats/status-code | 状态码统计 |
| GET | /api/v1/admin/access-logs/stats/time-range | 时间范围查询 |
| GET | /api/v1/admin/access-logs/export | 导出 CSV |
| DELETE | /api/v1/admin/access-logs/:id | 删除单条 |
| POST | /api/v1/admin/access-logs/clear | 清空日志 |

#### 备份管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/backups | 备份文件列表 |
| POST | /api/v1/admin/backups | 创建备份 |
| GET | /api/v1/admin/backups/:filename/download | 下载备份 |
| DELETE | /api/v1/admin/backups/:filename | 删除备份 |

#### 恢复（高负载端点，跳过 body size 限制）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/admin/restore/upload | 上传文件恢复 |
| POST | /api/v1/admin/restore/url | URL 恢复 |
| POST | /api/v1/admin/restore/local | 本地文件恢复 |
| POST | /api/v1/admin/restore/clear-all | 清空所有数据 |

### 5.14 公开端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /rss.xml | RSS Feed |
| GET | /sitemap.xml | Sitemap |
| GET | /robots.txt | Robots 协议 |
| GET | /health | 健康检查 |

## 6. 前端页面设计

### 6.1 前台博客

| 页面 | 路由 | 说明 |
|------|------|------|
| 首页 | / | 文章卡片列表，分页，侧边栏 |
| 文章详情 | /posts/[slug] | Markdown 渲染，TOC，评论（含实时预览+表情反应），相关文章，上/下一篇导航，系列信息 |
| 分类页 | /categories/[slug] | 分类下文章列表 |
| 标签页 | /tags/[slug] | 标签下文章列表 |
| 归档页 | /archive | 按年月分组 |
| 搜索页 | /search?q=xxx | 全文搜索 |
| 关于页 | /about | 个人介绍 |
| 文章系列 | /series/[slug] | 系列文章列表 |
| 图片馆 | /gallery | 瀑布流 + 灯箱浏览 |
| 音乐馆 | /music | 音乐播放器 |
| 友链 | /links | 友链展示 |
| 日历 | /calendar | 文章日历视图 |

视觉风格：
- 暗色模式默认，支持 dark/light/system 切换
- 顶部大 Banner Hero 区域
- 卡片式文章列表（封面图、日期、分类标签、摘要）
- 右侧边栏：头像、简介、社交链接、分类、**标签云（字体大小按文章数分档）**
- 响应式：移动端侧边栏折叠

### 6.2 后台管理

| 页面 | 路由 | 说明 |
|------|------|------|
| 登录 | /admin/login | 密码 + TOTP + Passkey |
| 找回密码 | /admin/forgot-password | 邮件找回 |
| 重置密码 | /admin/reset-password | 令牌重置 |
| 仪表盘 | /admin | 访问统计概览（PV/UV/图表） |
| 文章管理 | /admin/posts | 列表 + Markdown 编辑器 + 修订历史 |
| 分类管理 | /admin/categories | CRUD |
| 标签管理 | /admin/tags | CRUD |
| 评论管理 | /admin/comments | 审核（含 pending/approved/spam/rejected 四个 tab） |
| 媒体库 | /admin/media | 上传 + 标签 + 批量操作 |
| 分析统计 | /admin/analytics | 详细访问统计图表 |
| 审计日志 | /admin/access-logs | 日志查看 + 筛选 + 导出 |
| 封禁管理 | /admin/blocked | IP 手动封禁 + 自动封禁配置（双标签页） |
| 站点设置 | /admin/settings | 站点信息 + 主题 + 邮件 + 备份恢复 |
| 备份管理 | /admin/backup | 备份文件管理 |
| 个人资料 | /admin/profile | 头像、昵称、密码修改 |
| 文章系列 | /admin/series | 系列管理 + 选文章 |
| 导航管理 | /admin/nav-links | 导航链接 CRUD + 排序 |
| 友链管理 | /admin/links | 友链审核 + 申请管理 |
| 图片馆 | /admin/gallery | 图片管理 + 排序 |
| 音乐馆 | /admin/music-page | 音乐管理 |
| 通知管理 | /admin/notifications | 通知列表 |
| 日历 | /admin/calendar | 文章日历视图 |
| 使用帮助 | /admin/help | 新功能说明 |

视觉风格：
- 侧边栏导航 + 顶栏，玻璃态 (glass-card) 设计语言
- 统一圆角 (rounded-xl)、按钮 (btn-glass)
- 标签页使用下划线样式 (h-0.5 rounded-full 激活指示器)
- 表格列表 + 操作按钮
- Markdown 编辑器（@uiw/react-md-editor）
- 数据图表（recharts）
- 模态框表单错误显示为内联消息（非 alert）

## 7. 认证与安全

### 7.1 登录流程

```
用户访问 /admin/login
    │
    ▼
输入用户名 + 密码
    │
密码验证通过？
├─ 否 → 登录失败 → 自动封禁计数
└─ 是 → 用户启用了 TOTP？
          ├─ 否 → 签发 JWT → 跳转仪表盘
          └─ 是 → 输入 TOTP 码
                    │
               TOTP 验证通过？
               ├─ 否 → 显示错误
               └─ 是 → 签发 JWT → 跳转仪表盘
```

### 7.2 Passkey 登录流程

```
用户点击 "Passkey 登录"
    │
    ▼
获取登录选项（challenge）
    │
调用 WebAuthn API（指纹/面容/安全密钥）
    │
验证通过 → 签发 JWT → 跳转仪表盘
```

### 7.3 IP 封禁流程

```
请求到达 → IP Ban 中间件
    │
    ▼
跳过公共文件和管理后台？
├─ 是 → 放行
└─ 否 → 查询活跃封禁
          │
        IP 被封禁？
        ├─ 否 → 放行
        └─ 是 → 检查封禁范围
                  │
                  ├─ site → 403
                  ├─ 匹配请求模块 → 403
                  └─ 不匹配 → 放行

自动封禁流程：
登录失败 → failedLoginCounter（内存滑动窗口）
    │
窗口内失败次数 ≥ 阈值？
├─ 否 → 记录本次失败
└─ 是 → 创建自动 IPBan → 后续请求被中间件拦截
```

### 7.4 安全措施

- 密码：bcrypt 哈希
- JWT：HttpOnly Cookie，24h 过期，随机密钥
- TOTP：RFC 6238 标准
- Passkey：WebAuthn 标准
- CORS：仅允许配置的前端域名
- Rate Limiting：登录、评论、友链申请等敏感接口限流
- CSRF：关键操作验证 Token
- 审计日志：记录所有 HTTP 请求（GeoIP 位置可选）
- 管理员强制改密：首次登录或安全更新后强制
- 密码重置：邮件令牌验证

## 8. GeoIP 地理定位

使用 MaxMind GeoLite2 City 数据库（可选功能）。

### 8.1 实现方式

- **嵌入模式（默认）**：mmdb 文件放在 `backend/internal/utils/geoipdata/` 目录，使用 `//go:embed` 编译到二进制
- **外部覆盖**：设置环境变量 `GEOIP_DB_PATH` 指向外部 .mmdb 文件路径
- **初始化**：`utils.InitGeoIP()` 在 main.go 启动时调用
- **查询**：`utils.LookupIP(ipStr)` 返回 `(country, city)` 用于审计日志的地理位置记录

### 8.2 数据流

```
访问日志 → 中间件获取 IP → LookupIP → country + city → 写入 access_logs
```

如果没有嵌入或外部 mmdb 文件，GeoIP 功能静默禁用，不影响其他功能。

## 9. 备份与恢复

### 9.1 备份格式

单一 `.zip` 压缩包：

```
backup-YYYY-MM-DD/
├── data.json
└── uploads/
    ├── xxx.jpg
    └── yyy.png
```

### 9.2 包含数据

所有 AutoMigrate 注册的模型数据 + `uploads/` 目录文件。

### 9.3 恢复流程

1. 解析上传的 zip
2. 读取 `data.json`，验证格式和版本
3. 关闭 FK 检查 → 清空所有表
4. 按依赖顺序导入数据：users → categories → tags → media_tags → site_configs → posts → post_tags → comments → media → media_tag_links → passkeys → post_revisions → access_logs
5. 提取 `uploads/` 文件
6. 单事务运行，失败完全回滚

## 10. 外部依赖

| 功能 | 库/服务 |
|------|---------|
| Markdown 渲染 | react-markdown + remark-gfm + rehype-highlight + rehypeRaw |
| Markdown 编辑器 | @uiw/react-md-editor |
| 代码高亮 | highlight.js |
| 图表 | recharts |
| 地理位置 | MaxMind GeoLite2 City（可选，嵌入或外部文件） |
| 图片存储 | 本地文件系统，可扩展至 S3 |
| 邮件发送 | Go `net/smtp` + 模板 |
| AI 摘要 | 外部 LLM API（可配置） |

## 11. 部署

使用 Docker Compose 管理所有服务：

```yaml
services:
  postgres:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: tano_blog
      POSTGRES_USER: tano
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  backend:
    build: ./backend
    ports:
      - "8080:8080"
    depends_on:
      - postgres
    environment:
      DB_DSN: "host=postgres user=tano password=${DB_PASSWORD} dbname=tano_blog port=5432"
      JWT_SECRET: ${JWT_SECRET}
      GEOIP_DB_PATH: ${GEOIP_DB_PATH:-}
      CORS_ORIGINS: ${CORS_ORIGINS:-http://localhost:3000}
      SITE_URL: ${SITE_URL:-https://tano.asia}

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
    environment:
      NEXT_PUBLIC_API_URL: "http://backend:8080"
```

### 11.1 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| DB_DSN | PostgreSQL 连接串 | 必填 |
| JWT_SECRET | JWT 签名密钥 | 随机生成 |
| GEOIP_DB_PATH | GeoIP 数据库路径（可选） | 空（使用嵌入） |
| CORS_ORIGINS | 允许的跨域来源 | http://localhost:3000 |
| SITE_URL | 站点 URL | https://tano.asia |
| BACKUP_DIR | 备份存储目录 | ./backups |
| UPLOAD_DIR | 媒体上传目录 | ./uploads |
| SMTP_* | 邮件服务配置 | 可选 |
| AI_API_KEY | AI 服务密钥 | 可选 |
| AI_API_URL | AI 服务地址 | 可选 |
| AI_MODEL | AI 模型名 | 可选 |
