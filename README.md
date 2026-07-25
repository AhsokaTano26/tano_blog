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
DB_DSN=postgres://tano:tano_blog_pass@localhost:5431/tano_blog?sslmode=disable
JWT_SECRET=<随机字符串>
ADMIN_PASSWORD=<管理员密码>
SYNC_KEY_ENCRYPTION_KEY=<openssl rand -base64 32 的输出>
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
| `SYNC_KEY_ENCRYPTION_KEY` | 使用后台粘贴同步私钥时必填 | — | Base64 编码的 32 字节 AES 密钥；主备必须完全一致 |

### 主备跨机同步（rsync）

在两台服务器上部署同一版本后，可在“后台 → 备份与恢复 → 跨机同步”配置单向同步：主服务器选择 `primary`，备服务器选择 `standby`。主服务器按计划生成数据库一致性快照，备服务器使用 `rsync --partial --append-verify` 通过 SSH 拉取快照与上传文件，网络中断后会继续传输。

备服务器需安装 `rsync` 与 `ssh`，并配置仅用于同步的 SSH 密钥。可直接在同步后台粘贴私钥：它会以 AES-GCM 加密后保存，页面不会回显；两台服务器必须设置相同的 `SYNC_KEY_ENCRYPTION_KEY`（可用 `openssl rand -base64 32` 生成）。也可将私钥以只读 Secret 挂载到容器，例如 `/run/secrets/tano_sync_ed25519` 并填写文件路径。主服务器应为该账号限制为 rsync 使用，且在备机 `known_hosts` 中固定主机指纹。启用备机同步后，业务写接口会进入只读模式，避免双主写入。
| `CORS_ORIGINS` | No | `http://localhost:3000` | 允许的前端域名，逗号分隔 |
| `GIN_MODE` | No | `release` | Gin 模式（debug/release/test） |
| `LOG_LEVEL` | No | `info` | 日志级别 |
| `SITE_URL` | No | `https://tano.asia` | 站点 URL，用于 robots.txt |
| `TRUSTED_PROXIES` | No | `127.0.0.1,::1` | 可信反向代理地址/CIDR，逗号分隔 |
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
| `NEXT_PUBLIC_API_URL` | 空 | 浏览器 API 前缀；默认使用同源 Next.js rewrites |
| `API_UPSTREAM_URL` | `http://localhost:8080` | 后端 upstream 地址 |

## Docker 部署

```bash
cp .env.example .env
# 编辑 .env，替换其中的密码和 JWT 密钥
docker compose up --build -d
```

使用 `docker-compose.yml` 从当前工作区构建并启动 PostgreSQL + 应用容器。应用通过 `docker-entrypoint.sh` 同时启动 Go API（容器内端口 8080）和 Next.js 前端（宿主机端口 3000）。

首次启动务必查看日志获取管理员密码：
```bash
docker logs tano_blog_app 2>&1 | grep "password"
```

## Docker 主备跨机同步部署指南

完整的逐步操作、SSH 权限配置、故障排查和恢复流程见 [Docker 主备跨机同步部署指南](docs/docker-primary-standby-sync.md)。

Docker 部署不受影响：应用镜像已内置 `rsync` 和 OpenSSH 客户端。同步只从主机拉取“数据库快照 + 上传文件”，**不要**用文件同步工具直接复制 `data/postgres`，否则可能得到不一致的数据库文件。

### 1. 两台服务器准备

在主、备服务器分别部署相同版本的项目，并在两边各自执行：

```bash
cp .env.example .env
mkdir -p data/ssh
chmod 700 data/ssh
```

生成一次同步加密主密钥，并将同一行值填入两台机器的 `.env`。它用于加密后台粘贴的 SSH 私钥；不同值会使备机无法解密同步后的配置。

```bash
openssl rand -base64 32
```

```env
SYNC_KEY_ENCRYPTION_KEY=<上一步输出，主备完全相同>
```

各服务器的 `data/postgres`、`data/uploads`、`data/backups` 必须保留为本机持久化目录。应用容器会挂载整个 `data/` 到 `/data`，让备机能够原子切换上传目录；`data/ssh` 仍会只读挂载到容器内的 `/root/.ssh`，供 SSH 严格校验远程主机指纹。

### 2. 配置主机 SSH 账户

在主服务器创建一个专用的低权限账户（示例为 `sync`），并确保它至少能读取主机的 `/data/backups/sync` 与 `/data/uploads`。将备服务器所用 SSH 私钥对应的**公钥**加入主服务器该账户的 `~sync/.ssh/authorized_keys`。

在备服务器固定主服务器的 SSH 主机指纹。请在确认指纹来源可信后执行；不要关闭系统使用的严格主机校验。

```bash
ssh-keyscan -H primary.example.com > data/ssh/known_hosts
chmod 600 data/ssh/known_hosts
```

将 `primary.example.com` 替换为主服务器域名或 IP。两个站点使用不同域名没有影响：备机填写的是主服务器 SSH 地址，访问者仍分别使用各自的网站域名。

### 3. 启动和后台配置

两台服务器分别启动或更新容器：

```bash
docker compose up -d --build
```

随后在后台“备份与恢复 → 跨机同步”按以下顺序配置：

1. 主服务器：启用同步，角色选择“主服务器（生成快照）”，选择生成计划并保存。
2. 备服务器：启用同步，角色选择“备服务器（拉取并应用）”。填写 `sync@primary.example.com`、主机快照目录 `/data/backups/sync`、主机上传目录 `/data/uploads`。
3. 在备服务器粘贴 SSH 私钥并保存。系统加密保存且不会回显；也可选择挂载私钥文件后填写容器内路径。
4. 在备服务器点击“立即执行”，确认状态为成功后，再启用所需的间隔或每周任务。

备机启用同步后会拒绝常规业务写请求，因此文章、媒体和站点设置只能在主服务器修改。rsync 使用断点续传、校验和延迟切换：网络短暂中断时，下一次同步会继续未完成的文件。

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
