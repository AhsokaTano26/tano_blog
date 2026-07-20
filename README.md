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
- **文章导出** — 一键导出所有文章为 JSON

### Interaction & Engagement
- **评论系统** — 完整审核流程，支持 Markdown、LaTeX、回复串
- **评论表情反应** — 对评论点赞/添加表情 (👍❤️😂😮😢🙏)
- **文章表情反应** — 对文章添加表情反应
- **IP 封禁** — 手动封禁 + 自动封禁（登录失败达阈值后自动拉黑），支持按模块粒度（文章/评论/标签/全站等）
- **评论实时预览** — 发表前实时预览 Markdown 渲染效果
- **垃圾评论筛选** — 支持 spam 标签分类管理
- **猜你喜欢** — 基于标签匹配推荐相关文章（最多 6 篇）
- **上一篇/下一篇** — 按发布时间跳转相邻文章
- **标签云** — 侧边栏展示所有标签，字号与文章数关联
- **音乐馆** — 全屏音乐播放器，支持多播放列表、频谱可视化、粒子动画
- **图片馆** — 瀑布流图片展示 + 全屏灯箱浏览

### Media & Files
- **媒体库** — 图片/音频/视频上传与管理，支持标签分类和批量操作
- **拖拽上传** — 拖拽或粘贴剪贴板图片到编辑器自动上传
- **多种格式** — 支持常见图片、音频（mp3/flac/wav/aac/ogg）、视频格式
- **元信息读取** — 自动读取图片宽高、音频时长等元数据

### Security
- **JWT 认证** — 支持 Cookie 和 Authorization Header，自动随机密钥生成
- **CSRF 防护** — Double-submit Cookie 模式
- **TOTP 两步验证** — 基于时间的一次性密码
- **Passkey 通行密钥** — WebAuthn 生物识别/设备 PIN 登录，支持多设备
- **IP 自动封禁** — 登录失败计数，达阈值自动封禁，配置可调（次数/窗口/时长/范围）
- **强制改密** — 首次登录或管理员重置后强制修改密码
- **请求限流** — 敏感接口逐 IP 限流（内存滑动窗口）
- **CSP 头** — 严格 Content-Security-Policy
- **安全响应头** — HSTS、X-Frame-Options、X-Content-Type-Options 等

### System & Analytics
- **RSS Feed & Sitemap** — 自动生成
- **访问日志** — 记录所有请求，支持多维统计（国家、设备、浏览器、OS、时段、路径等）
- **GeoIP 地理定位** — 可选嵌入 MaxMind GeoLite2 数据库，记录访客国家/城市
- **统计分析** — PV/UV、设备分布、地理分布、来源统计（独立分析页面）
- **备份与恢复** — 创建/下载/删除备份，支持上传文件、URL、本地三种恢复方式
- **消息通知** — 新评论、友链申请等实时通知，未读计数角标
- **代码注入** — 自定义 head 和 footer 的 HTML/JavaScript
- **邮件通知** — 支持 SMTP 和 Zeabur Email API
- **管理员密码重置** — 邮件验证的安全找回流程

### Customization
- **主题切换** — 日间/夜间/跟随系统
- **主题色自定义** — 色相滑块自由调整主色调（0-360°），访客独立设置
- **导航管理** — 自定义顶部导航栏项目，拖拽排序
- **友链管理** — 友链申请审核与排序
- **帮助中心** — 后台内置完整功能说明（17 个功能模块）

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| **Backend** | Go 1.26, Gin 1.12, GORM 1.31 |
| **Database** | PostgreSQL 16 |
| **Auth** | JWT (HMAC), TOTP (RFC 6238), WebAuthn (Passkey) |
| **GeoIP** | MaxMind GeoLite2（可选，嵌入或外部文件） |
| **Infrastructure** | Docker, Alpine Linux |

## Project Structure

```
tano_blog/
├── frontend/                    # Next.js 前端
│   ├── src/
│   │   ├── app/                 # 页面路由
│   │   │   ├── (blog)/          # 前台博客（10+ 页面）
│   │   │   ├── admin/           # 管理后台（23+ 页面）
│   │   │   ├── gallery/         # 图片馆（瀑布流 + 灯箱）
│   │   │   └── music/           # 音乐馆（播放器 + 可视化）
│   │   ├── components/          # 共享 React 组件 (~25)
│   │   └── lib/                 # 工具函数与 API 客户端
│   └── public/                  # 静态资源
├── backend/                     # Go 后端
│   ├── cmd/server/main.go       # 入口（路由、初始化、中间件链）
│   └── internal/
│       ├── config/              # 配置加载
│       ├── handler/             # HTTP 处理器（16 handlers）
│       ├── middleware/          # 中间件（auth, cors, ratelimit, accesslog, ipban）
│       ├── model/               # 数据模型（21 models）
│       ├── repository/          # 数据库操作层
│       ├── service/             # 业务逻辑（邮件、AI）
│       └── utils/               # 工具函数（GeoIP、JWT、TOTP、Passkey）
├── docker-compose.yml           # PostgreSQL + 应用容器化
├── Dockerfile                   # 多阶段构建
└── docs/superpowers/            # 设计文档和计划
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
| `GEOIP_DB_PATH` | No | 空（使用嵌入） | GeoIP 数据库路径（覆盖嵌入文件） |
| `SMTP_HOST` | No | — | SMTP 服务器地址 |
| `SMTP_PORT` | No | — | SMTP 端口 |
| `SMTP_USER` | No | — | SMTP 用户名 |
| `SMTP_PASS` | No | — | SMTP 密码 |
| `SMTP_FROM` | No | — | 发件人地址 |
| `SMTP_FROM_NAME` | No | — | 发件人名称 |
| `AI_API_KEY` | No | — | AI 服务密钥 |
| `AI_API_URL` | No | — | AI 服务地址 |
| `AI_MODEL` | No | — | AI 模型名 |

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

## 后台管理

访问 `http://localhost:3000/admin` 进入管理后台。

管理页面一览（共 23+ 页面）：

| 页面 | 路由 | 说明 |
|------|------|------|
| 仪表盘 | /admin | 运营数据概览 |
| 文章管理 | /admin/posts | Markdown 编辑器 + 版本历史 |
| 分类管理 | /admin/categories | CRUD |
| 标签管理 | /admin/tags | CRUD + 文章计数 |
| 评论管理 | /admin/comments | 审核 + spam 标签 |
| 封禁管理 | /admin/blocked | IP 封禁 + 自动封禁配置 |
| 媒体库 | /admin/media | 文件上传 + 标签 |
| 文章系列 | /admin/series | 系列管理 + 选文章 |
| 图片馆 | /admin/gallery | 图片管理 + 排序 |
| 音乐馆 | /admin/music-page | 播放列表 + 歌曲管理 |
| 友链管理 | /admin/links | 审核 + 申请管理 |
| 导航管理 | /admin/nav-links | CRUD + 排序 |
| 站点设置 | /admin/settings | 基本信息 + 主题 + 邮件 |
| 备份管理 | /admin/backup | 创建/下载/恢复 |
| 审计日志 | /admin/access-logs | 日志查询 + 多维统计 |
| 统计分析 | /admin/analytics | 可视化数据图表 |
| 通知中心 | /admin/notifications | 系统通知管理 |
| 个人信息 | /admin/profile | 资料 + 密码 + 安全设置 |
| 日历 | /admin/calendar | 文章日历视图 |
| 帮助中心 | /admin/help | 功能说明文档 |

## Default Admin

首次启动自动创建管理员账号：
- 用户名：`admin`
- 密码：`ADMIN_PASSWORD` 环境变量（如未设置则随机生成，查看控制台输出）

首次登录后必须修改密码。

## License

MIT
