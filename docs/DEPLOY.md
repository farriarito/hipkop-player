# HIPKOP 公网 H5 / 数据迁移 / 运维

2026-10-09 已完成上线加固、真实 SQLite＋封面迁移和临时 HTTPS 分享。长期云托管尚未购买或创建。

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

```sh
npm test
npm run build
node scripts/verify-public-launch.js
```
