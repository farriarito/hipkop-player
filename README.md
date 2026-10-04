# HIPKOP PLAYER

HIPKOP PLAYER 是面向 **全球 HipHop/Rap + K-POP** 听众的竖屏音乐体验 MVP。它保留五 tab 信息架构、专辑/单曲/艺人详情、榜单、发现专题、社区和个人收藏路径，并在此基础上接入**真实的音乐元数据目录**。

## 已实现

- 竖屏手机壳：首页 / 榜单 / 发现 / 社区 / 我的
- **SQLite 元数据目录**（Node 内置 `node:sqlite`，零依赖）：`artists` / `albums` / `tracks` / `album_artists` / `track_artists` / `metadata_sources` / `cover_cache` / `sync_jobs`
- **合法、稳定的元数据 Provider**：iTunes/Apple Music（封面 + 作品，无需 Key）、MusicBrainz（艺人资料富化，无需 Key），可选 Deezer（艺人头像）与 Last.fm（需 `LASTFM_API_KEY`）
- **搜索**：本地目录优先，结果不足时调用 Provider，归一化后落库并建立艺人-专辑-曲目关联；结果按 艺人 / 专辑 / 单曲 分组
- **真实封面与头像**：服务端把第三方图下载到本地缓存，前端只使用 `/media/...`
- **封面代理 / 本地缓存 / 失败重试**：指数退避 + 失败记录 + 占位图
- **API**：`/api/search`、`/api/albums/:id`、`/api/artists/:id`、`/api/tracks/:id`、`/api/releases`、`/api/charts`、`/api/sync/*`
- **定时同步**：每日新作、每周榜单（Apple 榜单 RSS）、每日艺人资料刷新，失败重试与退避
- 前端静态数组已替换为 API 数据，静态数据仅作为**离线 fallback**

## 快速开始

```powershell
cd D:\hipkop-player
npm start            # http://127.0.0.1:4180/
```

首次启动会自动登记数据源、排入一次抓取任务，并开始后台同步。端口冲突时：

```powershell
$env:HIPKOP_PLAYER_PORT=4181
npm start
```

手动跑一次同步（适合 cron/CI）：

```powershell
npm run sync                 # 榜单 + 新作 + 队列
node scripts/sync-once.js --no-charts
```

## 目录结构

```text
server.js                  HTTP 服务：静态资源 + /api + /media
src/config.js              全部可用的环境变量
src/schema.js              SQLite 表结构
src/db.js                  node:sqlite 薄封装
src/normalize.js           统一数据模型与确定性评分
src/repo.js                目录读写（UPSERT、关联、查询、任务、缓存）
src/search.js              本地优先搜索 -> Provider -> 归一化 -> 落库
src/media.js               /media/cover|avatar|hero 代理与本地缓存
src/sync.js                同步任务与执行器（含退避重试）
src/scheduler.js           每分钟 drain 到期任务
src/api.js                 JSON API 与序列化
src/providers/              Provider 实现与注册表
public/                    前端（app.js 由 API 驱动）
tests/                     node --test 集成测试（不依赖网络）
scripts/sync-once.js       一次性同步
data/                      SQLite 与媒体缓存（已 gitignore）
```

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/search?q=&type=&page=&pageSize=` | 分组搜索（artists/albums/tracks） |
| GET | `/api/artists/:id` | 艺人资料 + 关联专辑 + 关联单曲 |
| GET | `/api/albums/:id` | 专辑 + 艺人 + 曲目 |
| GET | `/api/tracks/:id` | 单曲 + 艺人 + 所属专辑 |
| GET | `/api/releases?from=&to=&limit=` | 按发行日期的新作 |
| GET | `/api/charts?genre=&sort=&limit=` | 榜单（genre: all/rap/kpop，sort: popularity/score/date） |
| GET | `/api/health` | 目录统计 + Provider 健康状态 |
| GET | `/api/providers` / `/api/sources` | Provider 与数据源许可 |
| GET | `/api/sync/jobs` | 同步任务队列 |
| POST | `/api/sync/search` | 强制同步某个关键词 |
| POST | `/api/sync/album/:id` | 拉取专辑曲目 |
| POST | `/api/sync/artist/:id` | 刷新艺人资料与关联作品 |
| POST | `/api/sync/releases` / `/api/sync/charts` | 手动触发同步 |
| GET | `/media/cover\|avatar\|hero/:id` | 本地缓存的图片 |
| GET | `/media/proxy?url=` | 白名单主机图片代理 |

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HIPKOP_PLAYER_PORT` | `4180` | 端口 |
| `HIPKOP_PLAYER_HOST` | `127.0.0.1` | 监听地址 |
| `HIPKOP_DB_PATH` | `data/hipkop.sqlite` | SQLite 文件 |
| `HIPKOP_MEDIA_DIR` | `data/media` | 图片缓存目录 |
| `ITUNES_COUNTRIES` | `US,KR,CN` | iTunes storefront（首个为主） |
| `HIPKOP_SEED_ARTISTS` | 见 config | 新作扫描的种子艺人 |
| `HIPKOP_DISABLED_PROVIDERS` | 空 | 禁用的 Provider |
| `LASTFM_API_KEY` | 空 | 开启 Last.fm（艺人头像/简介） |
| `HIPKOP_SCHEDULER` | `1` | 设为 `0` 关闭后台同步 |
| `HIPKOP_DAILY_SYNC_HOUR` | `4` | 每日同步小时 |

## Provider 与许可

- **iTunes / Apple Music Search API**：公开、无需 Key，仅用于元数据与封面链接；本服务把图片缓存到本地后使用。
- **MusicBrainz**：CC0，用于艺人国家/流派/简介等富化，需带 `User-Agent`。
- **Deezer**：公开无需 Key，提供艺人头像；网络不可达时自动进入冷却、不影响搜索。
- **Last.fm**：需 `LASTFM_API_KEY`，提供艺人头像与简介。
- 未接入网易云/QQ 私有接口或登录 Cookie。将来接入已授权的 QQ/网易云 Provider 时，只需实现 `src/providers/index.js` 中的 Provider 契约并注册。

## 同步与重试

- `sync_jobs` 使用 `status + next_run_at` 调度，失败按 `30s * 2^(attempts-1)` 指数退避，最多 `max_attempts` 次。
- 活跃任务用部分唯一索引去重；重启后按 `last done + interval` 重新排期，不会重复抓取。
- 详情页在数据为空时按需触发一次同步；`cover_cache` 记录每次下载的尝试与错误。

## 验收自测

```powershell
npm run check                      # server.js / public/app.js 语法
npm test                           # 目录 + API 集成测试（离线）
$env:HIPKOP_PLAYER_PORT=4181; npm start
```

启动后验证（需联网）：

```powershell
node scripts/sync-once.js
# 浏览器打开 http://127.0.0.1:4181/
# 依次搜索：法老 · PACT · aespa · BLACKPINK · G-DRAGON · A$AP Rocky · 任意新艺人
```

每条结果应展示封面/头像、艺人关联、专辑或单曲类型、发行日期，并可打开详情页；API 不可用时给出明确的空状态与离线提示。

## 边界

本项目只同步**元数据与封面**，不下载、不转存、不分发任何音频；`previewUrl` 仅作为试听片段链接。榜单评分在没有真实用户评分前使用基于稳定元数据的**确定性编辑分**（UI 标注为编辑口径），Provider 提供真实热度时以真实热度优先。