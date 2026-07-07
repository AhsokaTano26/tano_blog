# Tano Blog

A modern personal blog system built with **Next.js 16** (frontend) and **Go + Gin + GORM** (backend), featuring a PostgreSQL database. Designed for fast content management, rich Markdown editing, and a polished reading experience.

## Features

### Content Management
- **Markdown 编辑器** — 分屏实时预览，支持 Mermaid 图表、KaTeX 数学公式、代码高亮
- **分类 & 标签** — 多级分类和标签管理，支持自定义 slug
- **文章系列/合集** — 将相关文章组织成系列，拖拽排序，底部进度条导航
- **文章版本** — 自动保存历史版本，可预览差异和回滚
- **预览令牌** — 草稿可生成唯一链接分享给他人，无需登录
- **定时发布** — 设置未来发布日期，到时间自动发布
- **密码保护** — 为特定文章设置访问密码
- **日历视图** — 以日历形式浏览文章发布记录

### Interaction & Engagement
- **评论系统** — 完整审核流程，支持 Markdown、LaTeX、回复串
- **评论表情反应** — 对评论点赞/添加表情
- **评论人管理** — 按邮箱或 IP 封禁
- **垃圾评论筛选** — 自动标记 spam 标签（is_spam）
- **评论实时预览** — 发表前实时预览 Markdown 渲染效果
- **文章表情反应** — 对文章添加表情反应
- **猜你喜欢** — 基于分类和标签推荐相关文章
- **上一篇/下一篇** — 按发布时间跳转相邻文章
- **标签云** — 侧边栏展示所有标签，字号与文章数关联
- **音乐馆** — 全屏音乐播放器，支持多播放列表、频谱可视化、粒子动画

### Media & Files
- **媒体库** — 图片/音频/视频上传与管理，支持标签分类
- **拖拽上传** — 拖拽或粘贴剪贴板图片到编辑器自动上传
- **多种格式** — 支持常见图片、音频（mp3/flac/wav/aac/ogg）、视频格式

### Security
- **JWT 认证** — 支持 Cookie 和 Authorization Header，自动随机密钥生成
- **CSRF 防护** — Double-submit Cookie 模式
- **TOTP 两步验证** — 基于时间的一次性密码
- **Passkey 通行密钥** — WebAuthn 生物识别/设备 PIN 登录
- **强制改密** — 首次登录或管理员重置后强制修改密码
- **请求限流** — 敏感接口逐 IP 限流（内存存储）
- **CSP 头** — 严格 Content-Security-Policy
- **安全响应头** — HSTS、X-Frame-Options、X-Content-Type-Options 等

### System & Analytics
- **RSS Feed & Sitemap** — 自动生成
- **访问日志** — 记录所有请求，支持多维统计（国家、设备、浏览器、OS、时段、路径等）
- **统计分析** — PV/UV、设备分布、地理分布、来源统计
- **备份与恢复** — 创建/下载/删除备份，支持上传文件、URL、本地三种恢复方式
- **消息通知** — 新评论、友链申请等实时通知
- **代码注入** — 自定义 head 和 footer 的 HTML/JavaScript
- **邮件通知** — 支持 SMTP 和 Zeabur Email API

### Customization
- **主题切换** — 日间/夜间/跟随系统
- **主题色自定义** — 色相滑块自由调整主色调（0-360°）
- **导航管理** — 自定义顶部导航栏项目
- **友链管理** — 友链申请审核与排序
- **帮助中心** — 后台内置完整功能说明

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| **Backend** | Go 1.26, Gin 1.12, GORM 1.31 |
| **Database** | PostgreSQL 16 |
| **Auth** | JWT (HMAC), TOTP (RFC 6238), WebAuthn (Passkey) |
| **Infrastructure** | Docker, Alpine Linux |

## Project Structure

```
tano_blog/
├── frontend/                    # Next.js 前端
│   ├── src/
│   │   ├── app/                 # 页面路由
│   │   │   ├── admin/           # 管理后台 (21 pages)
│   │   │   │   ├── posts/       # 文章管理
│   │   │   │   ├── comments/    # 评论管理
│   │   │   │   ├── media/       # 附件管理
│   │   │   │   ├── settings/    # 站点设置
│   │   │   │   ├── music-page/  # 音乐馆配置
│   │   │   │   ├── help/        # 帮助中心
│   │   │   │   └── ...
│   │   │   ├── posts/           # 前台文章页面
│   │   │   ├── music/           # 音乐馆播放页面
│   │   │   └── ...
│   │   ├── components/          # 共享 React 组件 (20)
│   │   └── lib/                 # 工具函数与 API 客户端
│   └── public/                  # 静态资源
├── backend/                     # Go 后端
│   ├── cmd/server/main.go       # 入口
│   └── internal/
│       ├── config/              # 配置加载
│       ├── handler/             # HTTP 处理器 (14 handlers)
│       ├── middleware/          # 中间件 (auth, cors, ratelimit, accesslog)
│       ├── model/               # 数据模型 (20 models)
│       ├── repository/          # 数据库操作
│       ├── service/             # 业务逻辑
│       └── utils/               # 工具函数
├── docker-compose.yml           # PostgreSQL + 应用容器化
├── Dockerfile                   # 多阶段构建
└── zeabur_email_api.md          # Zeabur Email API 参考
```

## Quick Start

### Prerequisites
- Go 1.26+
- Node.js 22+
- PostgreSQL 16 (or Docker)

### 1. 启动数据库

```bash
docker compose up -d
```

### 2. 配置后端

```bash
cd backend
cp .env.example .env
```

`.env` 内容：
```env
DB_DSN=postgres://tano:tano_blog_pass@localhost:5432/tano_blog?sslmode=disable
JWT_SECRET=<随机字符串>
ADMIN_PASSWORD=<管理员密码>
```

### 3. 启动后端

```bash
cd backend
go run ./cmd/server
```

后端默认运行在 `http://localhost:8080`。首次启动自动创建管理员账号并输出密码到控制台。

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端默认运行在 `http://localhost:3000`，通过 Next.js rewrites 将 `/api/*` 代理到后端。

## Environment Variables

### Backend

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DB_DSN` | Yes | — | PostgreSQL 连接字符串 |
| `JWT_SECRET` | No | 随机 32 字节 | JWT 签名密钥 |
| `ADMIN_PASSWORD` | No | 随机 8 字符 Hex | 初始管理员密码 |
| `SERVER_PORT` | No | `8080` | 服务端口 |
| `UPLOAD_DIR` | No | `./uploads` | 上传文件存储目录 |
| `UPLOAD_MAX_IMAGE_MB` | No | `50` | 图片上传大小限制 (MB) |
| `UPLOAD_MAX_AUDIO_MB` | No | `200` | 音频上传大小限制 (MB) |
| `UPLOAD_MAX_VIDEO_MB` | No | `2048` | 视频上传大小限制 (MB) |
| `BACKUP_DIR` | No | `./backups` | 备份文件目录 |
| `CORS_ORIGINS` | No | `http://localhost:3000` | 允许的前端域名，逗号分隔 |
| `GIN_MODE` | No | `release` | Gin 模式（debug/release/test） |
| `LOG_LEVEL` | No | `info` | 日志级别 |
| `SITE_URL` | No | `https://tano.asia` | 站点 URL，用于 robots.txt |

### Frontend

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | 后端 API 地址（非 Docker 部署，由 Next.js rewrites 代理） |
| `API_UPSTREAM_URL` | `http://localhost:8080` | 后端 upstream 地址 |

## Docker 部署

```bash
docker compose up -d
```

使用 `docker-compose.yml` 启动 PostgreSQL + 应用容器。应用通过 `docker-entrypoint.sh` 同时启动 Go API（端口 8080）和 Next.js 前端（端口 3000）。

首次启动务必查看日志获取管理员密码：
```bash
docker logs tano_blog_app 2>&1 | grep "password"
```

## API 概览

所有 API 以 `/api/v1` 为前缀。完整 API 文档见 `openapi.yaml`。

### 公开接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/posts` | 文章列表（分页） |
| GET | `/api/v1/posts/:slug` | 文章详情 |
| GET | `/api/v1/posts/top` | 置顶文章 |
| GET | `/api/v1/posts/top-viewed` | 热门文章 |
| GET | `/api/v1/posts/:slug/adjacent` | 上一篇/下一篇 |
| GET | `/api/v1/posts/:slug/related` | 猜你喜欢 |
| POST | `/api/v1/posts/:slug/reactions` | 文章表情反应 |
| POST | `/api/v1/posts/:slug/verify-password` | 验证文章密码 |
| GET | `/api/v1/posts/preview` | 预览令牌查看草稿 |
| GET | `/api/v1/posts/calendar` | 文章日历数据 |
| GET | `/api/v1/archive` | 文章归档 |
| GET | `/api/v1/categories` | 分类列表 |
| GET | `/api/v1/tags` | 标签列表 |
| GET | `/api/v1/series` | 系列列表 |
| GET | `/api/v1/config/public` | 公开站点配置 |
| POST | `/api/v1/auth/login` | 登录 |
| POST | `/api/v1/auth/login/totp` | TOTP 两步验证登录 |
| POST | `/api/v1/auth/forgot-password` | 忘记密码 |
| POST | `/api/v1/auth/reset-password` | 重置密码 |
| GET | `/api/v1/posts/:slug/comments` | 评论列表 |
| POST | `/api/v1/posts/:slug/comments` | 提交评论 |
| POST | `/api/v1/posts/:slug/comments/:id/reactions` | 评论表情反应 |
| GET | `/api/v1/links` | 友链列表 |
| POST | `/api/v1/links/apply` | 友链申请 |
| GET | `/api/v1/nav-links` | 导航链接 |
| GET | `/rss.xml` | RSS Feed |
| GET | `/sitemap.xml` | Sitemap |
| GET | `/robots.txt` | Robots 协议 |

### 认证接口（需登录）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/auth/me` | 当前用户信息 |
| POST | `/api/v1/auth/logout` | 退出登录 |
| PUT | `/api/v1/auth/profile` | 更新个人资料 |
| PUT | `/api/v1/auth/password` | 修改密码 |
| POST | `/api/v1/auth/totp/setup` | TOTP 设置 |
| POST | `/api/v1/auth/totp/verify` | TOTP 验证 |
| DELETE | `/api/v1/auth/totp` | 禁用 TOTP |
| GET | `/api/v1/notifications` | 通知列表 |
| GET | `/api/v1/notifications/unread-count` | 未读通知数 |

### 管理接口（需管理员）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/v1/admin/posts` | 文章 CRUD |
| PUT/DELETE | `/api/v1/admin/posts/:id` | 单篇文章操作 |
| GET/POST | `/api/v1/admin/categories` | 分类管理 |
| GET/POST | `/api/v1/admin/tags` | 标签管理 |
| GET | `/api/v1/admin/comments` | 评论管理 |
| GET/POST | `/api/v1/admin/series` | 系列管理 |
| GET/PUT | `/api/v1/admin/config` | 站点配置 |
| POST | `/api/v1/admin/upload` | 文件上传 |
| GET/DELETE | `/api/v1/admin/media` | 媒体管理 |
| GET/DELETE | `/api/v1/admin/backups` | 备份管理 |
| POST | `/api/v1/admin/restore/*` | 数据恢复 |
| GET/DELETE | `/api/v1/admin/access-logs` | 访问日志 |
| GET/POST | `/api/v1/admin/links` | 友链管理 |
| GET/POST | `/api/v1/admin/nav-links` | 导航管理 |
| GET | `/api/v1/admin/users` | 用户列表 |

详细 API 路径和方法见 `openapi.yaml`。

## 后台管理

访问 `http://localhost:3000/admin` 进入管理后台。

### 路由列表

| 路径 | 功能 |
|------|------|
| `/admin` | 仪表盘概览 |
| `/admin/posts` | 文章管理 |
| `/admin/calendar` | 日历视图 |
| `/admin/categories` | 分类管理 |
| `/admin/tags` | 标签管理 |
| `/admin/comments` | 评论管理 |
| `/admin/media` | 媒体库 |
| `/admin/series` | 系列管理 |
| `/admin/links` | 友链管理 |
| `/admin/nav-links` | 导航管理 |
| `/admin/music-page` | 音乐馆配置 |
| `/admin/profile` | 个人信息 |
| `/admin/settings` | 站点设置 |
| `/admin/access-logs` | 访问日志 |
| `/admin/analytics` | 统计分析 |
| `/admin/backup` | 备份与恢复 |
| `/admin/notifications` | 消息通知 |
| `/admin/help` | 帮助中心 |

## Default Admin

首次启动自动创建管理员账号：
- 用户名：`admin`
- 密码：`ADMIN_PASSWORD` 环境变量（如未设置则随机生成，查看控制台输出）

首次登录后必须修改密码。

## License

MIT
