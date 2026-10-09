# HIPKOP 公网 H5 / 数据迁移 / 运维

2026-10-09 已完成上线加固、真实 SQLite＋封面迁移和临时 HTTPS 分享。长期云托管尚未购买或创建。
协作者新推送的 `deploy/server/` 已保留并调整生产保护；其中所述远程主机未在本会话连接或验证，不能据此宣称已完成云部署。NFS home 不得直接作为 SQLite WAL 生产磁盘。

运行时是**单进程 Node 服务**：SPA 静态资源 + JSON API + SQLite 目录 + 封面缓存，
外部依赖只有可选的 Redis（只做缓存，见「性能与缓存」）；没有 Postgres，也没有外部构建链。
需要持久化的仍然只有两样：`HIPKOP_DB_PATH` 与 `HIPKOP_MEDIA_DIR`。

## 临时公网分享

```powershell
npm ci
npm run build
npm run data:export -- backups/my-private-snapshot
$env:HIPKOP_DB_PATH="$PWD/data/public-share/hipkop.sqlite"
$env:HIPKOP_MEDIA_DIR="$PWD/data/public-share/media"
npm run data:restore -- backups/my-private-snapshot
Remove-Item Env:HIPKOP_DB_PATH,Env:HIPKOP_MEDIA_DIR
pwsh -File scripts/start-share.ps1
# 停止：pwsh -File scripts/stop-share.ps1
```

`cloudflared-windows-amd64.exe` 必须放入 `tmp/deploy-tools/cloudflared.exe`，并通过 Windows 签名校验。分享 URL 随进程结束失效；电脑必须保持开机。

## 正式 Docker＋Caddy

准备域名和 Linux 云服务器，仅开放 80/443：

```sh
cp .env.example .env
# 设置 HIPKOP_DOMAIN、HIPKOP_ADMIN_TOKEN（至少 32 个随机字符）
docker compose build
```

私有迁移包不能进 Git；先将其放到服务器，再在 app 容器停止写入时恢复：

```sh
docker compose run --rm --no-deps -v "$PWD/private-bundle:/migration:ro" app \
  node scripts/migrate-data.js restore /migration
docker compose up -d
```

`docker-compose.yml` 使用持久 `/data`、非 root、只读根文件系统、无额外 capabilities；Caddy 自动 HTTPS，app 的 8080 只在 Docker 内部可见。必须配置 `HIPKOP_PUBLIC_ORIGIN=https://域名`，并确认重启后曲库、封面和帖子仍存在。
不要在恢复前先启动空库；restore 不会覆盖已生成的数据库。当前环境无 Docker 引擎，仅完成生产 Node 实机验收和部署配置校验，未声称容器／Caddy 实机上线。

## Render

`render.yaml` 已准备 Node、健康检查和 `/var/data` 持久磁盘。模板使用付费计划／磁盘，创建前确认费用，不会自动购买。连接 GitHub 后设置 `HIPKOP_PUBLIC_ORIGIN`，并用私有渠道恢复迁移包；SQLite 不能放临时构建目录。

## 数据迁移

```sh
npm run data:export -- backups/DATE
npm run data:verify -- backups/DATE
npm run data:restore -- backups/DATE
```

导出使用 `VACUUM INTO`，复制真实数据库和封面；改写为跨系统文件名，清空活动会话，重置运行中任务，校验 SHA-256、SQLite integrity/foreign-key。恢复拒绝覆盖现有数据库或非空媒体目录。备份包含真实社区数据和账号数据，禁止上传 GitHub。

## 上线加固

- `/api/sync/*` 与 `/api/admin/*` 只接受 `Authorization: Bearer` 管理密钥，修改仅 POST，拒绝 URL token。
- 生产公开 health 隐藏路径、任务数和详细 Provider 错误。
- 生产社区发帖须账号＋CSRF＋同源，进入 pending；管理员使用 `node scripts/moderate.js list|approve <id>|reject <id>`。
- 账号密码为 scrypt＋随机盐，Cookie 为 Secure/HttpOnly/SameSite=Lax；收藏仍是当前设备本地存储。
- 搜索、发帖、媒体下载限流；JSON/URL/代理/图片大小和请求超时均有限制。
- 图片仅允许 HTTPS allowlist，校验 DNS 公网地址、重定向、内容类型和字节上限。

限流为单实例内存计数，重启会重置；`HIPKOP_TRUST_PROXY` 仅在隔离的可信反代后启用。原 UI 使用 inline handlers，CSP 仍含 `'unsafe-inline'`，不是严格 CSP。当前尚无找回密码、邮箱验证、跨设备收藏、自动审核和多实例限流；正式商业上线应补齐隐私协议、监控、异地备份及供应商条件。音频仍为试听/平台跳转，不托管完整版音源。

管理员审核（密钥不放浏览器、不放 URL）：

```powershell
node --env-file=data/public-share/runtime.env scripts/moderate.js list
node --env-file=data/public-share/runtime.env scripts/moderate.js approve 123
```

生产数据留存在独立的 `data/public-share/`，旧开发服务器 4185 仍使用原库。后续迁往正式服务器时应导出**分享服务的新库**，而不是只带走上线前原库：

```powershell
node --env-file=data/public-share/runtime.env scripts/migrate-data.js export backups/public-latest-NEW_TIMESTAMP
```

每次分享服务更新：`npm run build` 后执行 `pwsh -File scripts/restart-share-app.ps1`，仅重启 app、保留 HTTPS 隧道地址和数据。随机域名变化时收藏/Cookie 不跨域。

正式备份：每天用 export 生成一致性包，并通过私有加密渠道复制到不同存储。至少每周恢复演练；本次未创建自动定时任务或宣称已实现自动异地备份。回滚前停止目标服务、保存其最新私有包；恢复到空目录，不裸复制正在写入的 WAL 主文件。

## 验收

<<<<<<< HEAD
```sh
npm test
npm run build
node scripts/verify-public-launch.js
=======
| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HIPKOP_PLAYER_PORT` / `PORT` | `4180` | 端口；平台注入 `PORT` 时优先生效 |
| `HIPKOP_PLAYER_HOST` | `127.0.0.1` | 注入 `PORT` 时自动变 `0.0.0.0`；容器里固定 `0.0.0.0` |
| `HIPKOP_DB_PATH` | `data/hipkop.sqlite` | 目录文件，容器内为 `/data/hipkop.sqlite` |
| `HIPKOP_MEDIA_DIR` | `data/media` | 封面缓存目录 |
| `HIPKOP_ADMIN_TOKEN` | 空 | 设置后 `/api/sync/*` 需要 `x-hipkop-token` 或 `?token=` |
| `DEEPSEEK_API_KEY` | 空 | 分类 Agent；不填走离线启发式，功能不缺失 |
| `HIPKOP_AGENT_URL` / `HIPKOP_AGENT_MODEL` | DeepSeek 默认值 | 换成任意 OpenAI 兼容端点 |
| `LASTFM_API_KEY` | 空 | 可选，补艺人简介/头像 |
| `HIPKOP_CHART_STOREFRONTS` | `us,kr,jp` | 榜单来源区，多区合并才有真实热度 |
| `ITUNES_COUNTRIES` | `US,KR,CN` | 元数据回查区顺序 |
| `HIPKOP_SCHEDULER` | `1` | 关掉即不自动同步 |
| `HIPKOP_REDIS_URL` | 空 | 空 = 进程内 LRU；填了就用 Redis 做共享读缓存 |
| `HIPKOP_CACHE_ENTRIES` | `500` | 进程内缓存条数上限 |
| `HIPKOP_MEDIA_CONCURRENCY` | `6` | 同时回源拉图的并发上限 |
| `HIPKOP_MEDIA_TIMEOUT` | `8000` | 单张封面的回源超时（毫秒） |

## 性能与缓存

线上反馈过「每个页面都要转很久」。实测（公网隧道）结论很明确：**瓶颈不是请求数，
也不是并发，而是首屏图片体积**——首页 35 个请求里 8 张封面各 300+ KB，合计 1.9 MB，
而 `<img>` 只显示 300px。围绕这点做了四层：

| 层 | 做了什么 | 效果 |
| --- | --- | --- |
| 图片尺寸 | `/media/cover/:id?w=300` 回源时把 Apple 的 `900x900bb.jpg` 改写成 `300x300bb.jpg`，只缓存 100/300/600/900 四档 | 单张 330 KB → 48 KB，首屏 1.9 MB → ~300 KB |
| 封面落盘 | 回源图片落盘 + `cover_cache` 表，命中后不再出网；同一 URL 的并发请求合并成一次回源 | 冷启动不再打满上游，复访零回源 |
| 静态资源 | JS/CSS 走 gzip + `ETag`，带 `?v=` 的 URL 发 `immutable`，HTML 保持 `no-store` | 二访 304，前端包 58 KB → 16 KB |
| API 读缓存 | `/api/*` 的 GET 按路由 TTL 缓存（榜单 60s、艺人/专辑 300s…），同步任务提交后按命名空间失效 | 同一页面内重复读、以及多访客之间不再重复查库 |

### Redis 在其中的位置

API 读缓存有两个后端，同一套语义：

- **进程内 LRU（默认）**：单容器 / 单进程部署直接用它，零运维。
- **Redis**：设置了 `HIPKOP_REDIS_URL` 时启用，用来跨副本共享、并在重启后保留。
  `docker compose up -d` 已经带了一个（`--maxmemory 256mb --maxmemory-policy allkeys-lru`，
  不落盘），并把 `HIPKOP_REDIS_URL=redis://redis:6379` 注入应用。

两处工程细节值得记住：

- **失效按命名空间代数（generation）走，不是扫 key。** 缓存 key 形如
  `hipkop:cache:<命名空间>:g<代数>:<key>`，失效只是把 `hipkop:gen:<命名空间>` 加一,
  所以一次同步不会留下过期页面，也不会产生 `KEYS` 这类会拖垮 Redis 的操作。
- **Redis 是可选依赖，不是硬依赖。** 连不上时自动退回进程内 LRU（`/api/health`
  不变），最坏情况是慢，不会 500。所以用户态部署（`deploy/server/`）不装 Redis 也完全可用。

### 冷启动预热

新机器上封面缓存是空的，第一批访客会触发回源。可以提前跑一轮：

```bash
HIPKOP_MEDIA_CONCURRENCY=6 node scripts/warm-media.js   # 按 300/600/100 三档预取
```

节流默认 6 个并发，别调太高，否则容易被上游图床限流。
## 数据：迁移与备份

把本地已经灌好的目录直接搬到服务器（比重新同步快，也保留人工校准结果）：

```bash
# 停服后复制，三件套一起拷（WAL 里可能有未落盘的数据）
docker compose stop
docker run --rm -v hipkop-data:/data -v "$PWD/data:/src:ro" node:24-slim \
  sh -c 'cp /src/hipkop.sqlite* /data/ && chown -R 1000:1000 /data'
docker compose start
>>>>>>> 09b8816 (perf: keep pages off the network with sized covers and a read cache)
```
