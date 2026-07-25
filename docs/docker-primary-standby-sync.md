# Docker 主备跨机同步部署指南

本文说明如何将 Tano Blog 部署在两台 Docker 服务器上，并通过系统内置的 rsync 同步功能实现“主机写入、备机拉取”。

## 1. 架构与限制

```
管理员 / 访客写入 ──> 主服务器（primary）
                         │ 生成数据库一致性快照
                         │
                         ├─ SSH + rsync ──> 备服务器（standby）
                         │                  拉取快照和 uploads
                         └──────────────────────────────────────
```

- 主服务器是唯一可编辑内容的位置。
- 备服务器定时拉取主服务器的数据库快照和上传文件；启用同步后，备机业务写接口会自动只读。
- 传输采用 `rsync --partial --append-verify`，网络中断后再次执行会续传并校验。
- 同步不是双向同步，也不是自动故障切换。主机失效后，如需将备机提升为主机，应先停用备机同步并确认数据状态。
- 两个站点可以使用不同域名；同步配置中的 SSH 地址只用于服务器间连接，和访客访问的站点域名无关。

> 不要直接通过 rsync、NFS 或云盘复制 `data/postgres`。正在运行的 PostgreSQL 数据目录不能这样复制；本系统会先在主机生成可恢复的一致性数据库快照。

## 2. 前置条件

准备两台 Linux 服务器：

| 角色 | 示例域名 | 职责 |
| --- | --- | --- |
| 主服务器 | `blog-primary.example.com` | 接收编辑、生成同步快照 |
| 备服务器 | `blog-standby.example.com` | 拉取并应用同步数据 |

两台机器都需要：

- Docker Engine 与 Docker Compose v2；
- 同一版本的 Tano Blog 项目；
- 固定的项目绝对路径，例如 `/srv/tano_blog`；
- 主服务器开放 SSH 端口（默认 `22`）给备服务器；
- 主服务器 SSH 账户有权限读取项目的 `data/uploads` 和 `data/backups/sync`。

应用镜像已经包含 `rsync` 与 OpenSSH 客户端，因此无需在容器中额外安装软件。

## 3. 部署两套 Docker 服务

以下命令在主、备两台服务器都执行。示例假设项目路径为 `/srv/tano_blog`：

```bash
cd /srv/tano_blog
cp .env.example .env
mkdir -p data/ssh
chmod 700 data/ssh
```

编辑两台服务器各自的 `.env`：

```env
DB_PASSWORD=<各机器独立、强随机的数据库密码>
JWT_SECRET=<各机器独立的随机值>
ADMIN_PASSWORD=<初始管理员密码>
SITE_URL=https://各自的网站域名
TZ=Asia/Shanghai
SYNC_KEY_ENCRYPTION_KEY=<主备完全相同的值>
```

`SYNC_KEY_ENCRYPTION_KEY` 必须只生成一次并复制到两台服务器；它用来加密后台粘贴的 SSH 私钥。生成命令：

```bash
openssl rand -base64 32
```

不要把真实 `.env` 提交到 Git、截图或发送给无关人员。每台机器的 PostgreSQL、上传文件和备份必须各自持久化在项目的 `data/` 下；当前 `docker-compose.yml` 已提供对应挂载。

启动服务：

```bash
docker compose up -d --build
docker compose ps
```

## 4. 配置主服务器 SSH 读取权限

备机会通过 SSH 登录**主服务器宿主机**并运行 rsync。请创建一个仅用于同步的账户，而不是使用 root：

```bash
sudo adduser --disabled-password --gecos '' sync
```

假设主服务器项目路径是 `/srv/tano_blog`，授权该用户读取同步来源。具体权限策略取决于系统管理员规范，以下仅为示例：

```bash
sudo setfacl -R -m u:sync:rx /srv/tano_blog/data/uploads
sudo setfacl -R -m u:sync:rx /srv/tano_blog/data/backups
```

如果系统未安装 `setfacl`，可改用专用用户组和最小必要的目录读/执行权限。不要让同步账户拥有 sudo、写权限或交互式管理权限。

### 生成备机 SSH 密钥

在备服务器生成专用 ed25519 密钥：

```bash
cd /srv/tano_blog
ssh-keygen -t ed25519 -f data/ssh/tano_sync_ed25519 -C 'tano-standby-sync'
cat data/ssh/tano_sync_ed25519.pub
```

将输出的**公钥**追加到主服务器 `sync` 用户的 `~sync/.ssh/authorized_keys`。私钥不要离开备服务器；稍后可将其粘贴到后台保存，或通过只读文件挂载使用。

### 固定主服务器 SSH 指纹

在备服务器将主服务器指纹保存到 Compose 已挂载的 `known_hosts`：

```bash
ssh-keyscan -H blog-primary.example.com > data/ssh/known_hosts
chmod 600 data/ssh/known_hosts
```

`ssh-keyscan` 的结果应与通过可信渠道取得的主机指纹核对一致后再使用。系统启用了 `StrictHostKeyChecking=yes`；这是为了阻止中间人或误连到其他主机，不能以关闭校验来替代指纹配置。

## 5. 识别 Docker 宿主机路径

SSH 连接的是主服务器**宿主机**，不是应用容器。因此后台中的“主机快照目录”和“主机上传目录”必须填写宿主机绝对路径，而不是容器内 `/data/...` 路径。

若项目在 `/srv/tano_blog`，应填写：

| 后台字段 | 填写值 |
| --- | --- |
| 主机 SSH 目标 | `sync@blog-primary.example.com` |
| SSH 端口 | `22`（主服务器使用非默认端口时填写实际端口） |
| 主机快照目录 | `/srv/tano_blog/data/backups/sync` |
| 主机上传目录 | `/srv/tano_blog/data/uploads` |

容器内的 `/data/backups/sync` 与 `/data/uploads` 只在应用容器中存在；它们通过 bind mount 映射到上表所示的宿主机目录。

## 6. 后台配置顺序

### 主服务器

1. 访问“后台 → 备份与恢复 → 跨机同步”。
2. 勾选“启用跨机同步”，角色选择“主服务器（生成快照）”。
3. 选择固定间隔或每周计划并保存。主服务器只生成同步快照，不需要填写 SSH 私钥。
4. 点击“立即执行”，确认状态显示快照已生成。

### 备服务器

1. 同样进入“跨机同步”，勾选启用，角色选择“备服务器（拉取并应用）”。
2. 填写上一节的 SSH 目标和**宿主机绝对路径**。
3. 在“SSH 私钥（粘贴后加密保存）”粘贴 `data/ssh/tano_sync_ed25519` 的内容并保存。私钥会 AES-GCM 加密存入数据库，页面不会回显。
4. 点击“立即执行”。首次成功后，状态会显示同步快照名称与完成时间。
5. 确认文章、媒体和前台页面正常，再设置备机计划。建议备机执行时间比主机晚 5–10 分钟，确保先有新快照可拉取。

若采用文件方式而非粘贴方式，将私钥保留在 `data/ssh/`，填写容器路径 `/root/.ssh/tano_sync_ed25519`；权限应为 `600`。已保存的粘贴私钥优先于文件路径。

## 7. 验证与日常运维

首次验证建议：

1. 在主服务器创建或修改一篇测试文章并保存。
2. 主服务器点击“立即执行”生成快照。
3. 备服务器点击“立即执行”拉取并应用。
4. 在备站检查文章内容、图片和音频文件是否存在。
5. 检查备机同步状态中的完成时间、快照名和消息。

正常情况下只在主机编辑。备机为只读是刻意设计，可避免双主冲突；如需维护备机数据，先在后台停用同步或将其提升为主机。

监控日志：

```bash
cd /srv/tano_blog
docker compose logs -f app
```

## 8. 常见问题

### `Host key verification failed`

备机 `data/ssh/known_hosts` 缺少或包含过期指纹。核对主机真实指纹后更新该文件，再重启 app 容器：

```bash
docker compose up -d --force-recreate app
```

### `Permission denied (publickey)`

确认粘贴的是完整私钥、主服务器 `authorized_keys` 中是匹配公钥、SSH 目标用户名正确，且 `sync` 用户可登录。也要检查主服务器的 SSH 服务没有禁止该用户。

### rsync 找不到远程目录

通常是将容器路径 `/data/...` 错填为远程路径。请填写主服务器宿主机上的绝对路径，例如 `/srv/tano_blog/data/uploads`。

### 同步完成但媒体缺失

确认 `sync` 用户拥有上传目录及所有父目录的读取和执行权限，并确认后台远程上传目录指向主服务器项目的 `data/uploads`。

### 备机无法解密私钥

两端的 `SYNC_KEY_ENCRYPTION_KEY` 不一致，或容器更新后没有重新创建。修正 `.env` 后执行：

```bash
docker compose up -d --force-recreate app
```

如无法找回原密钥，需要在备机后台重新粘贴私钥并保存。

## 9. 故障切换建议

当主服务器不可用时：

1. 确认备机最后一次同步时间与内容满足恢复目标。
2. 在备机后台关闭跨机同步，或停掉其应用容器后再修改配置。
3. 将备机对外域名或反向代理切换为主服务入口。
4. 此后只在备机编辑；原主机恢复前不要让两端同时写入。
5. 原主机恢复后，将它作为新的备机重新配置并从当前主机拉取数据。

正式生产环境建议定期演练此流程，并保留独立备份；主备同步不能代替离线备份。
