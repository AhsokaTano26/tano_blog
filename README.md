# Tano Blog

A modern personal blog system built with Next.js and Go.

## Tech Stack

**Frontend** — Next.js 16, React 19, Tailwind CSS 4, TypeScript

**Backend** — Go, Gin, GORM, PostgreSQL 16

## Features

- Markdown 文章编辑与渲染（支持 Mermaid 图表、KaTeX 数学公式、代码高亮）
- 分类与标签管理
- 评论系统（支持审核、批量操作、邮件通知）
- 媒体附件管理（上传、标签分类）
- RSS Feed 与 Sitemap 自动生成
- 邮件通知（支持 Zeabur Email 和 SMTP 两种服务商）
- 代码注入（自定义 Head、页脚 HTML）
- 主题切换（深色 / 浅色 / 跟随系统）与主题色自定义
- 访问日志与统计
- 安全特性：JWT 认证、CSRF 防护、TOTP 二步验证、Passkey 通行密钥、请求限流

## Project Structure

```
tano_blog/
├── frontend/          # Next.js 前端
│   ├── src/
│   │   ├── app/       # 页面路由
│   │   ├── components/# React 组件
│   │   └── lib/       # 工具函数与 API 客户端
│   └── public/        # 静态资源
├── backend/           # Go 后端
│   ├── cmd/server/    # 入口
│   └── internal/
│       ├── config/    # 配置加载
│       ├── handler/   # HTTP 处理器
│       ├── middleware/ # 中间件
│       ├── model/     # 数据模型
│       ├── repository/# 数据库操作
│       ├── service/   # 业务逻辑
│       └── utils/     # 工具函数
└── docker-compose.yml # PostgreSQL
```

## Quick Start

### 1. 启动数据库

```bash
docker compose up -d
```

### 2. 配置后端

```bash
cd backend
cp .env.example .env   # 或手动创建 .env
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

后端默认运行在 `http://localhost:8080`。

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端默认运行在 `http://localhost:3000`。

## Environment Variables

### Backend

| 变量 | 必填 | 说明 |
|------|------|------|
| `DB_DSN` | Yes | PostgreSQL 连接字符串 |
| `JWT_SECRET` | Yes | JWT 签名密钥 |
| `ADMIN_PASSWORD` | Yes | 初始管理员密码 |
| `SERVER_PORT` | No | 服务端口，默认 `8080` |
| `UPLOAD_DIR` | No | 上传目录，默认 `./uploads` |
| `UPLOAD_MAX_MB` | No | 上传大小限制 (MB)，默认 `10` |
| `CORS_ORIGINS` | No | 允许的前端域名，逗号分隔，默认 `http://localhost:3000` |
| `GIN_MODE` | No | `debug` / `release`，默认 `release` |

### Frontend

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_API_URL` | 后端 API 地址，默认 `http://localhost:8080` |

## API

所有 API 以 `/api/v1` 为前缀。

**公开接口：**
- `GET /posts` — 文章列表
- `GET /posts/:slug` — 文章详情
- `GET /categories` — 分类列表
- `GET /tags` — 标签列表
- `POST /posts/:slug/comments` — 提交评论
- `GET /rss.xml` — RSS Feed
- `GET /sitemap.xml` — Sitemap

**管理接口（需认证）：**
- `/admin/posts` — 文章 CRUD
- `/admin/categories` — 分类管理
- `/admin/tags` — 标签管理
- `/admin/comments` — 评论管理
- `/admin/media` — 媒体管理
- `/admin/config` — 站点配置
- `/admin/access-logs` — 访问日志

## Default Admin

首次启动自动创建管理员账号：
- 用户名：`admin`
- 密码：`ADMIN_PASSWORD` 环境变量的值
