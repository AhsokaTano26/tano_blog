# 真实浏览器回归

`npm run test:browser` 启动独立 Go API 和 Next.js 生产构建，串行运行 Chromium 与 WebKit。覆盖真实登录、草稿刷新恢复、双窗口版本冲突、粘贴上传与缩略图、图片尺寸、对齐、图片延迟加载后的双向滚动，以及移动端阅读、评论关闭和密码访问限制。

测试依赖固定为 `@playwright/test@1.63.0`。1.64.x 携带的 Linux WebKit r2370 在模糊背景下存在严重渲染回归，会让点击稳定性检查超时；见 [Playwright #43426](https://github.com/microsoft/playwright/issues/43426)。升级时需确认新的稳定版已修复该问题，并重跑 Linux 双浏览器回归。

## 本地运行

使用专用 PostgreSQL 测试数据库。`TEST_DATABASE_DSN` 只接受回环地址；不要填写生产连接。测试创建随机 `e2e_*` schema，媒体和备份写入临时目录。

```sh
cd backend
go build -o server ./cmd/server
go build -o browserfixture ./cmd/browserfixture
cd ../frontend
npm ci
npx playwright install chromium webkit
NEXT_PUBLIC_API_URL= API_UPSTREAM_URL=http://127.0.0.1:18080 npm run build
# 在当前终端配置指向专用本地测试库的 TEST_DATABASE_DSN 后运行：
npm run test:browser
# 只验证一种浏览器：
npm run test:browser -- --browser webkit
```

测试构建使用 `API_UPSTREAM_URL=http://127.0.0.1:18080` 和空 `NEXT_PUBLIC_API_URL`，覆盖本地 `.env.local` 的开发接口地址。测试占用 18080 和 3097；启动前分别检测 IPv4 和 IPv6，发现端口被占用会失败。浏览器只允许请求本轮站点地址。无需手动启动开发服务器。正常发布的容器仍使用 Dockerfile 中的生产构建配置。

## 资源保护与证据

浏览器入口复用单元测试的全机互斥锁、独立 Python 监控和进程组清理。总时限为 300 秒，采样内存阈值为 3072 MiB，Node 堆限制为 512 MiB；macOS 统计包含压缩内存的 `phys_footprint`，Linux 汇总 RSS。采样阈值不是操作系统硬内存上限。

测试专用 spawn 适配器阻止 Playwright 将浏览器分离到其他进程组，确保服务器和浏览器都受监控。成功、失败、超时和信号退出都会清理进程组；随后只删除本次 schema。若 Python 本身被强杀，下次运行会拒绝遗留活动进程组；不要绕过锁重跑。

每次运行会打印唯一的 `e2e_*` run ID，结果、服务日志和截图存放在 `frontend/test-results/browser/<run ID>/`（不提交）。不同轮次互不覆盖，也不复用旧截图；历史目录可在检查后自行删除。`results.json` 初始状态为 `running`，只有浏览器明确完成且进程与清理均成功后，Python 才写入 `status: passed` 和 `exit_code: 0`。超时、内存中止、信号退出及清理失败会留下本轮失败状态和退出码；Python 本身被强杀时残留的 `running` 不能视为通过。CI 运行同一入口并保留 7 天证据。测试使用随机凭据，不读取实际文章或媒体；请勿将真实内容放入测试夹具。日志记录测试页面的错误，可能包含测试内容。

## 边界

此流程验证 WebKit 引擎，不等于真实 Safari 或实体设备验证。它也不模拟 macOS 合盖唤醒；原故障的物理复测仍需单独、受控地执行。CI 中只恢复自动生成的隔离夹具，生产备份的恢复操作见 [运维监测与恢复演练](operations-monitoring.md)。
