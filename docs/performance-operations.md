# 性能与容量运维指南

Docker 部署使用根目录 `.env`，独立 Go API 使用 `backend/.env`；从对应 `.env.example` 复制后配置。修改环境变量后需重启 API；Compose 部署可运行 `docker compose up -d --force-recreate app` 重新创建应用容器。构建新版本使用 `docker compose up --build -d`。默认网站入口为 `http://localhost:3001`。

## 连接池与请求预算

| 环境变量 | 默认值 | 生效范围 |
| --- | --- | --- |
| `DB_MAX_OPEN_CONNS` | `20` | 每个 API 进程最多打开的 PostgreSQL 连接数 |
| `DB_MAX_IDLE_CONNS` | `10` | 每个 API 进程最多保留的空闲数据库连接数 |
| `REQUEST_TIMEOUT_SECONDS` | `30` | 普通 API 请求预算，单位秒 |
| `UPLOAD_TIMEOUT_SECONDS` | `1800` | 媒体上传、备份创建/下载、恢复请求预算，单位秒 |
| `ACCESS_LOG_RETENTION_DAYS` | `0` | 原始访问日志保留天数；`0` 或未设置关闭自动清理 |

连接池与超时配置来自 `backend/internal/config/config.go`；这四个参数需为 `1..100000` 的整数，否则使用默认值。空闲连接数不宜高于最大打开连接数。多实例部署时按实例数计算总连接预算，并为数据库管理和其他服务保留连接。

请求超时或客户端断开会取消相应请求上下文中的数据库工作。外层反向代理或托管平台的请求体与超时上限仍需与目标上传大小、操作时长匹配。后台备份和恢复客户端默认等待最多 30 分钟；单独提高 API 超时不会同步修改浏览器预算。

管理员可通过已登录会话访问 `GET /api/v1/admin/metrics`，查看数据库连接池统计、`access_log_pending` 和 `access_log_dropped`。数据库连接等待持续增长时，应结合慢查询、并发请求与 PostgreSQL 连接预算判断原因。

## 访问日志与统计

日志列表和统计默认查询最近 30 个自然日，包含今天；支持最多 366 天的范围。日期以 UTC+8 解释，开始和结束日期均包含在查询中。范围限制只控制查询，不会删除更早记录；需要查看旧数据时可选择对应日期区间。

日志列表首次分页计算当前筛选总数，后续页使用 `(created_at, id)` 游标。浏览期间新写入的头部记录不会插入已有游标后续页，显示总数沿用首次查询；刷新或重新筛选会重建分页。

`ACCESS_LOG_RETENTION_DAYS` 在 `backend/cmd/server/main.go` 启动时直接读取，不属于 `config.Load()` 的配置字段。只有正整数才启用清理；未设置、`0`、负数或无效值都不启用。启用后每小时清理早于“当前时间减去保留天数”的原始日志，每批最多删除 5000 行，一次清理预算为 5 分钟。此操作会影响被删除日期的统计和导出，因此应先确定所需保留范围，再设置正数。

访问日志异步批量写入，队列容量为 2048。队列满时丢弃当前记录，批次写入失败时丢弃该批日志，以限制资源占用；`access_log_dropped` 统计当前进程启动以来的丢弃数，批次写入失败还会记录 `access log batch dropped` 警告。故障排查时应同时检查该计数和数据库状态。

## 大文件上传与 Next.js 代理

普通 Next.js rewrite 代理的请求体缓冲限制为 `50MB`。以下两个固定路由使用专用流式代理，不经过该缓冲路径，因此不会被普通代理的 50MB 设置截断：

- `POST /api/v1/admin/upload`
- `POST /api/v1/admin/restore/upload`

专用路由仍遵守 Go 后端大小检查、认证、CSRF 和请求预算。媒体限制可通过以下变量调整，名称中的 `MB` 实际以 `1024 × 1024` 字节计算：

| 环境变量 | 默认上限 |
| --- | --- |
| `UPLOAD_MAX_IMAGE_MB` | 50 MiB |
| `UPLOAD_MAX_AUDIO_MB` | 200 MiB |
| `UPLOAD_MAX_VIDEO_MB` | 2048 MiB |

备份恢复使用下面的独立归档限制，不受媒体大小变量控制。

## 备份、恢复与同步快照

备份将数据库逐行编码到 ZIP，恢复先将各表流式验证到临时文件，再在一个数据库事务中按批次恢复。`BACKUP_DIR` 需要容纳归档和恢复期间解压后的 JSON 临时数据；失败、取消或完成后会清理本次临时数据。仍支持 1.0/1.1 备份格式；旧版缺少完整凭据的 Passkey 记录会跳过。

| 归档限制 | 上限 |
| --- | --- |
| 压缩后的 ZIP 文件 | 500 MiB |
| 所有 ZIP 条目解压后总大小 | 2 GiB |
| `data.json` 单项 | 2 GiB，仍计入总量 |
| 其他单个 ZIP 条目 | 500 MiB |
| 同步上传文件清单 | 64 MiB |

导出和恢复均检查相应限制。数据 JSON 超过旧版的 256 MiB 阈值可流式恢复，但仍需满足以上归档上限。

“后台 → 备份与恢复”显示阶段、当前表、记录数及字节进度。对应接口为 `GET /api/v1/admin/backup/status` 和 `POST /api/v1/admin/backup/cancel`，均需要管理员权限。同一进程只运行一个备份或恢复任务。等待捕获锁、导出、验证和数据库写入阶段可以取消；恢复开始提交后进入“完成恢复”，停止接受取消并完成上传文件替换。数据库提交前失败或取消会回滚；提交后的文件恢复错误会在结果中报告警告。

普通备份和主机同步快照共用短暂的独占业务写锁：先固定数据库视图，再在上传目录下的 `.sync-snapshots/` 中建立媒体硬链接集合，随后释放写锁进行导出和校验。普通备份结束会清理该集合；同步快照保留对应集合供备机拉取，并在发布新快照后清理旧集合。上传目录需要支持硬链接，运行中的冻结目录不得被外部清理任务删除。硬链接保留捕获时的文件对象，应用删除或通过临时文件替换原文件不会改变已捕获的内容。硬链接不防止原地写入；外部媒体维护任务也应使用临时文件加 rename 替换。

新同步包包含 `snapshot-uploads.json` 和上传文件 SHA256 清单，备机从相应冻结目录拉取并校验后应用；旧同步包仍使用原上传目录并进行清单校验。恢复会保留备机本地同步配置和加密私钥。部署账号对 `.sync-snapshots/` 及其文件也需有读取权限，具体 SSH 与目录权限配置见 [主备同步指南](docker-primary-standby-sync.md)。普通 `backup-*.zip` 超过 7 天后由每小时任务清理。

## 服务端渲染与 IP 封禁

首页和文章详情可以在服务端读取初始内容。当存在生效中的 IP 封禁，或封禁状态查询失败时，带 `X-Render-Request: 1` 的服务端读取会收到 HTTP 409，页面回退到浏览器请求，由常规访问检查判断权限。文章读取不跨用户缓存；已有解锁或登录状态只随当前请求传递。部署时保持正确的 `TRUSTED_PROXIES` 与真实客户端 IP 转发配置，勿通过放宽封禁检查来处理这种回退。

## 升级与预览链接

API 启动时自动执行数据库迁移。新建文章未指定预览令牌时，仓储层自动生成 UUID。迁移先创建 `idx_posts_preview_token_active` 部分唯一索引，仅约束非空 `preview_token`；成功后再移除旧索引 `idx_posts_preview_token`。已有非空令牌不重写，历史预览链接保留。若迁移失败，API 会停止启动；应查看迁移错误并处理原因，无需手工重置所有文章的预览令牌。

## 验证命令

使用 Node.js 22+、Go 1.26.2+ 和 PostgreSQL 16。从仓库根目录分别执行：

```bash
cd frontend
npm ci
npm test
npm run lint
npm run build
```

```bash
cd backend
go test ./...
go vet ./...
```

未设置 `TEST_DATABASE_DSN` 时，需要 PostgreSQL 的集成测试会跳过。要包含真实数据库的上传、分页、备份恢复、迁移及事务回滚测试，请使用专用测试数据库，且测试账号具有创建、删除 schema 的权限：

```bash
cd backend
export TEST_DATABASE_DSN='postgres://test_user:test_password@127.0.0.1:5431/tano_blog_test?sslmode=disable'
go test ./...
TEST_LARGE_BACKUP=1 go test ./internal/handler -run TestBackupLargeJSONRoundTrip -count=1 -v
```

集成测试会建立独立随机 schema 并在结束后删除。`TEST_LARGE_BACKUP=1` 额外启用超过 256 MiB JSON 的备份往返测试，需要相应磁盘空间；它默认不运行。这里的数据库名称、账号和密码均为示例，应替换为测试环境值。
