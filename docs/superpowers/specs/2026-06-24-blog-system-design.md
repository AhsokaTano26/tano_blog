# 个人博客系统设计文档

> 参考站点：https://tano.asia (Halo CMS + Theme-Fuwari)

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

## 2. 架构

前后端分离架构：

- **Next.js 前端**：负责前台 SSR 渲染（SEO 友好）和后台管理页面（CSR）
- **Go + Gin 后端**：提供 REST API，处理业务逻辑、认证、文件上传
- **PostgreSQL**：持久化存储

```
┌─────────────────────────────────────────┐
│           Next.js Frontend              │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │  前台博客  │  │   后台管理系统        │ │
│  │  (SSR)    │  │   (CSR)              │ │
│  │  /        │  │   /admin/*           │ │
│  └──────────┘  └──────────────────────┘ │
└────────────────┬────────────────────────┘
                 │ REST API
┌────────────────▼────────────────────────┐
│           Go + Gin Backend              │
│  /api/v1/auth       认证                │
│  /api/v1/posts      文章管理            │
│  /api/v1/categories 分类管理            │
│  /api/v1/tags       标签管理            │
│  /api/v1/comments   评论管理            │
│  /api/v1/upload     文件上传            │
│  /api/v1/site       站点配置            │
│  /api/v1/admin/access-logs 审计日志     │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│           PostgreSQL                    │
│  users | passkeys | posts | categories  │
│  tags | comments | media | site_config  │
│  access_logs                            │
└─────────────────────────────────────────┘
```

## 3. 项目目录结构

```
tano_blog/
├── frontend/                  # Next.js 前端
│   ├── src/
│   │   ├── app/
│   │   │   ├── (blog)/        # 前台博客（路由组）
│   │   │   │   ├── page.tsx           # 首页
│   │   │   │   ├── posts/[slug]/      # 文章详情
│   │   │   │   ├── categories/[slug]/ # 分类页
│   │   │   │   ├── tags/[slug]/       # 标签页
│   │   │   │   ├── archive/           # 归档页
│   │   │   │   ├── search/            # 搜索页
│   │   │   │   ├── about/             # 关于页
│   │   │   │   └── layout.tsx         # 博客布局（侧边栏）
│   │   │   ├── admin/         # 后台管理（CSR）
│   │   │   │   ├── login/             # 登录页
│   │   │   │   ├── posts/             # 文章管理
│   │   │   │   ├── categories/        # 分类管理
│   │   │   │   ├── tags/              # 标签管理
│   │   │   │   ├── comments/          # 评论管理
│   │   │   │   ├── media/             # 媒体库
│   │   │   │   ├── access-logs/       # 审计日志
│   │   │   │   ├── settings/          # 站点设置
│   │   │   │   └── layout.tsx         # 管理后台布局
│   │   │   └── layout.tsx     # 根布局
│   │   ├── components/        # 通用组件
│   │   ├── lib/               # API 客户端、工具函数
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
│   │       └── main.go
│   ├── internal/
│   │   ├── config/            # 配置加载
│   │   ├── handler/           # HTTP 处理器
│   │   │   ├── auth.go
│   │   │   ├── post.go
│   │   │   ├── category.go
│   │   │   ├── tag.go
│   │   │   ├── comment.go
│   │   │   ├── media.go
│   │   │   ├── config.go
│   │   │   └── access_log.go
│   │   ├── middleware/        # 中间件
│   │   │   ├── auth.go        # JWT 认证
│   │   │   ├── cors.go
│   │   │   ├── ratelimit.go
│   │   │   └── access_log.go  # 审计日志记录
│   │   ├── model/             # 数据模型（GORM）
│   │   ├── repository/        # 数据库操作层
│   │   ├── service/           # 业务逻辑层
│   │   └── utils/             # 工具函数
│   ├── go.mod
│   └── go.sum
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

## 5. API 设计

### 5.1 认证 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/v1/auth/login | 用户名+密码登录 | 否 |
| POST | /api/v1/auth/logout | 登出 | 是 |
| GET | /api/v1/auth/me | 获取当前用户 | 是 |
| POST | /api/v1/auth/totp/setup | 生成 TOTP 二维码 | 是 |
| POST | /api/v1/auth/totp/verify | 验证并启用 TOTP | 是 |
| DELETE | /api/v1/auth/totp | 禁用 TOTP | 是 |
| POST | /api/v1/auth/passkey/register/options | Passkey 注册选项 | 是 |
| POST | /api/v1/auth/passkey/register/verify | Passkey 注册验证 | 是 |
| POST | /api/v1/auth/passkey/login/options | Passkey 登录选项 | 否 |
| POST | /api/v1/auth/passkey/login/verify | Passkey 登录验证 | 否 |
| DELETE | /api/v1/auth/passkey/:id | 删除 Passkey | 是 |
| GET | /api/v1/auth/passkeys | 列出 Passkeys | 是 |

### 5.2 文章 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/posts | 文章列表（分页、筛选） | 否 |
| GET | /api/v1/posts/:slug | 文章详情 | 否 |
| GET | /api/v1/posts/top | 置顶文章 | 否 |
| GET | /api/v1/archive | 归档（按年月） | 否 |
| POST | /api/v1/admin/posts | 创建文章 | 是 |
| PUT | /api/v1/admin/posts/:id | 更新文章 | 是 |
| DELETE | /api/v1/admin/posts/:id | 删除文章 | 是 |
| PATCH | /api/v1/admin/posts/:id/status | 修改状态 | 是 |
| PATCH | /api/v1/admin/posts/:id/top | 置顶/取消 | 是 |

### 5.3 分类 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/categories | 分类列表 | 否 |
| GET | /api/v1/categories/:slug | 分类详情+文章 | 否 |
| POST | /api/v1/admin/categories | 创建 | 是 |
| PUT | /api/v1/admin/categories/:id | 更新 | 是 |
| DELETE | /api/v1/admin/categories/:id | 删除 | 是 |

### 5.4 标签 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/tags | 标签列表 | 否 |
| GET | /api/v1/tags/:slug | 标签详情+文章 | 否 |
| POST | /api/v1/admin/tags | 创建 | 是 |
| PUT | /api/v1/admin/tags/:id | 更新 | 是 |
| DELETE | /api/v1/admin/tags/:id | 删除 | 是 |

### 5.5 评论 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/posts/:id/comments | 文章评论列表 | 否 |
| POST | /api/v1/posts/:id/comments | 提交评论 | 否 |
| GET | /api/v1/admin/comments | 后台评论列表 | 是 |
| PATCH | /api/v1/admin/comments/:id/status | 审核评论 | 是 |
| DELETE | /api/v1/admin/comments/:id | 删除评论 | 是 |

### 5.6 媒体 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/v1/admin/upload | 上传文件 | 是 |
| GET | /api/v1/admin/media | 媒体列表 | 是 |
| DELETE | /api/v1/admin/media/:id | 删除媒体 | 是 |

### 5.7 站点配置 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/admin/config | 获取配置 | 是 |
| PUT | /api/v1/admin/config | 更新配置 | 是 |

### 5.8 审计日志 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/v1/admin/access-logs | 日志列表（分页、筛选） | 是 |
| GET | /api/v1/admin/access-logs/stats | 访问统计 | 是 |

## 6. 前端页面设计

### 6.1 前台博客

| 页面 | 路由 | 说明 |
|------|------|------|
| 首页 | / | 文章卡片列表，分页，侧边栏 |
| 文章详情 | /posts/[slug] | Markdown 渲染，TOC，评论，分享 |
| 分类页 | /categories/[slug] | 分类下文章列表 |
| 标签页 | /tags/[slug] | 标签下文章列表 |
| 归档页 | /archive | 按年月分组 |
| 搜索页 | /search?q=xxx | 全文搜索 |
| 关于页 | /about | 个人介绍 |

视觉风格：
- 暗色模式默认，支持 dark/light/system 切换
- 顶部大 Banner Hero 区域
- 卡片式文章列表（封面图、日期、分类标签、摘要）
- 右侧边栏：头像、简介、社交链接、分类、标签云
- 响应式：移动端侧边栏折叠

### 6.2 后台管理

| 页面 | 路由 | 说明 |
|------|------|------|
| 登录 | /admin/login | 用户名+密码、Passkey、TOTP |
| 仪表盘 | /admin | 访问统计概览 |
| 文章管理 | /admin/posts | 列表、新建/编辑（Markdown 编辑器） |
| 分类管理 | /admin/categories | CRUD |
| 标签管理 | /admin/tags | CRUD |
| 评论管理 | /admin/comments | 审核、删除 |
| 媒体库 | /admin/media | 上传、管理文件 |
| 审计日志 | /admin/access-logs | 日志查看、筛选 |
| 站点设置 | /admin/settings | 站点信息、主题等 |

视觉风格：
- 侧边栏导航 + 顶栏
- 表格列表 + 操作按钮
- Markdown 编辑器（@uiw/react-md-editor）
- 数据图表（recharts）

## 7. 认证流程

### 7.1 登录流程

```
用户访问 /admin
    │
    ▼
输入用户名 + 密码
    │
密码验证通过？
├─ 否 → 显示错误
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

### 7.3 安全措施

- 密码：bcrypt 哈希
- JWT：HttpOnly Cookie，24h 过期
- TOTP：RFC 6238 标准
- Passkey：WebAuthn 标准
- CORS：仅允许前端域名
- Rate Limiting：登录接口限流
- CSRF：关键操作验证 Token
- 审计日志：记录所有请求

## 8. 外部依赖

| 功能 | 库/服务 |
|------|---------|
| Markdown 渲染 | react-markdown + remark-gfm + rehype-highlight |
| Markdown 编辑器 | @uiw/react-md-editor |
| 代码高亮 | highlight.js |
| 图表 | recharts |
| 地理位置 | MaxMind GeoLite2（可选） |
| 图片存储 | 本地存储，可扩展至 S3 |

## 9. 部署

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

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
    environment:
      NEXT_PUBLIC_API_URL: "http://backend:8080"
```
