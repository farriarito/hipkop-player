# 部署到公网

应用是**单进程 Node 服务**：SPA 静态资源 + JSON API + SQLite 目录 + 封面缓存，
没有 Redis / Postgres / 外部构建链。需要持久化的只有两样东西：

| 路径 | 内容 |
| --- | --- |
| `HIPKOP_DB_PATH` | SQLite 目录（艺人 / 专辑 / 曲目 / 榜单 / 社区） |
| `HIPKOP_MEDIA_DIR` | 封面与头像缓存（`/media/...` 代理的落盘位置） |

容器镜像已把两者固定在 `/data` 卷下，镜像约 330 MB（Node 24 slim + 前端产物）。

## 三种路径

| 路径 | 拿到什么 | 成本 | 备注 |
| --- | --- | --- | --- |
| A. 一台服务器 + Docker | 自己的域名 + HTTPS，长期稳定 | 服务器费用 + 域名 | 推荐，本文重点 |
| B. PaaS（Railway / Render / Fly.io） | 平台子域名 + HTTPS | 免费额度或几美元/月 | **必须挂持久卷**，否则每次部署目录清空 |
| C. 隧道（Cloudflare Tunnel / Tailscale Funnel） | 立刻可用的公网地址 | 免费 | 适合演示；笔记本关机即失效 |

---

## A. 服务器 + Docker

```bash
git clone git@github.com:farriarito/hipkop-player.git && cd hipkop-player
cp .env.example .env      # 可选：填 DEEPSEEK_API_KEY
docker compose up -d --build
curl -s http://127.0.0.1:8080/api/health
```

首次启动目录是空的，服务会自己排队 `releases` + `charts` + 艺人刷新任务，
几分钟内就会灌入真实封面与榜单（实测 75 秒内 617 张专辑 / 331 张封面）。

域名与 HTTPS 用 Caddy 收口（自带证书申请）：

```bash
# 把 deploy/Caddyfile 里的域名换成自己的，A 记录指向服务器
caddy run --config deploy/Caddyfile
```

`deploy/Caddyfile` 里带 `basic_auth`，因为社区接口允许匿名发帖、且没有账号体系，
公网裸奔会被刷。改密码哈希：

```bash
caddy hash-password --plaintext '你的密码'
```

反向代理必须保留这三件事：转发 `Host`、透传 `X-Forwarded-Proto`、
请求体上限 ≥ 2 MB（发帖内容最大 2000 字符）。

## B. PaaS

1. 新建项目并连接仓库，构建方式选 Dockerfile（`Dockerfile` 已在根目录）。
2. 加一个**持久卷**，挂载到 `/data`。
3. 设置环境变量：`HIPKOP_ADMIN_TOKEN`、`DEEPSEEK_API_KEY`（可选）。
   平台注入的 `PORT` 会被自动识别，并自动绑定 `0.0.0.0`。
4. 健康检查路径 `/api/health`。

> SQLite 跑在 WAL 模式下，卷必须是**块设备/本地盘**；把 `data/` 挂到对象存储或
> 网络文件系统（NFS/EFS）会导致锁失效。

## C. 立刻可用的临时公网地址

Cloudflare 隧道，无需账号：

```bash
cloudflared tunnel --url http://127.0.0.1:8080
# 输出 https://<随机>.trycloudflare.com
```

Tailscale Funnel（需要先在后台开 HTTPS 证书与 `funnel` ACL 属性）：

```bash
tailscale funnel --bg 8080     # https://<机器名>.<tailnet>.ts.net
tailscale funnel --bg off      # 关掉
```

隧道适合演示与手机端验收，不要长期当生产入口：地址随机、无 SLA、笔记本关机即断。

---

## 环境变量

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

## 数据：迁移与备份

把本地已经灌好的目录直接搬到服务器（比重新同步快，也保留人工校准结果）：

```bash
# 停服后复制，三件套一起拷（WAL 里可能有未落盘的数据）
docker compose stop
docker run --rm -v hipkop-data:/data -v "$PWD/data:/src:ro" node:24-slim \
  sh -c 'cp /src/hipkop.sqlite* /data/ && chown -R 1000:1000 /data'
docker compose start
```

备份同理，复制 `/data/hipkop.sqlite*` 与 `/data/media` 即可；建议先
`docker compose stop` 保证一致快照。

## 安全

- 公网务必设置 `HIPKOP_ADMIN_TOKEN`：`/api/sync/*` 会写库并向 Apple/上游发起请求，
  敞开等于把服务器变成免费元数据代理。
- 社区 `POST /api/community/posts` 按产品设计保持开放，匿名可发。要么用
  `deploy/Caddyfile` 的 `basic_auth` 守住整站，要么后续加真正的账号体系。
- `DEEPSEEK_API_KEY` 只存在服务端进程环境里，不会下发给浏览器；Agent 没有 HTTP 入口。
- 图片一律走 `/media/...` 代理，浏览器不会直连第三方图床。

## 排障

| 现象 | 原因 |
| --- | --- |
| 平台部署后目录空了 | 没挂持久卷，或卷没挂到 `/data` |
| `SQLITE_BUSY` / 数据回滚 | 卷是网络文件系统，或两个容器同时写同一个目录文件 |
| 首页空、健康检查 `albums: 0` | 首次同步还没跑完，看 `docker logs` 里的 `sync scheduled` |
| 榜单没有热度 | `HIPKOP_CHART_STOREFRONTS` 被改成了单区 |
| 手机打不开局域网地址 | 服务仍绑在 `127.0.0.1`，设 `HIPKOP_PLAYER_HOST=0.0.0.0` 并放行防火墙 |