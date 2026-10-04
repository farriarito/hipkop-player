# HIPKOP PLAYER：同步数据库接手说明

> 当前日期：2026-10-04
> 状态：本文档所列的 1–9 项已落地（见下），10 为验收清单。

## 现状（已实现）

当前网页具备竖屏页面、专辑/单曲/艺人详情、榜单、新作横滑和搜索，并且**前端不再依赖写死数组**：

- 数据来自 `src/api.js` 暴露的 JSON API；
- 目录存放在 SQLite（`data/hipkop.sqlite`），首次启动自动抓取；
- 封面/头像由服务端缓存后经 `/media/...` 输出；
- `public/app.js` 中的静态数组仅作为**离线 fallback**。

架构与文件说明见 `README.md`。

## Soundive 已确认的数据链路（保持兼容）

前端契约：`getAlbums`、`getArtists`、`getArtist`、`getLatestAlbums`、`syncAlbumTracks`、`resolveQQListenSong`
对应到本项目：

| Soundive | HIPKOP |
| --- | --- |
| `getAlbums({keyword,page,pageSize})` | `GET /api/search?q=&page=&pageSize=` |
| `getAlbums({id})` | `GET /api/albums/:id` |
| `getArtists({keyword,limit})` | `GET /api/search?q=&type=artist` |
| `getArtist({id})` | `GET /api/artists/:id` |
| `getLatestAlbums` | `GET /api/releases` |
| `syncAlbumTracks` | `POST /api/sync/album/:id` |
| `resolveQQListenSong` | 未接入（需要授权 Provider，见下） |

## 本次交付对照

1. **合法稳定数据源** — iTunes/Apple（封面+作品，无需 Key）、MusicBrainz（富化，CC0），可选 Deezer、Last.fm。未使用网易云/QQ 私有接口或登录 Cookie。见 `src/providers/`。
2. **数据库** — SQLite（Node 内置 `node:sqlite`，零依赖）；`HIPKOP_DB_PATH` 可指向任意路径。若上生产 PostgreSQL，替换 `src/db.js` 驱动即可，表结构见 `src/schema.js`。
3. **表** — `artists`、`albums`、`tracks`、`album_artists`、`track_artists`、`metadata_sources`、`cover_cache`、`sync_jobs`，唯一键为 `(provider, provider_*_id)`。
4. **前端 API 化** — 已完成，静态数组降级为离线 fallback。
5. **缓存/代理/重试** — `src/media.js`：下载到 `data/media`，`cover_cache` 记录状态与错误，`/media/proxy` 仅允许白名单主机；`src/util/http.js` 提供超时 + 指数退避。
6. **API 路由** — `/api/albums/:id`、`/api/artists/:id`、`/api/releases`、`/api/charts` 全部可用，另有 `/api/search`、`/api/tracks/:id`、`/api/health`、`/api/sync/*`。
7. **定时同步** — `src/scheduler.js` 每分钟 drain；每日新作（种子艺人）、每周榜单（Apple 榜单 RSS，写入真实热度）、每日艺人资料刷新；失败重试 + 退避。
8. **任意未预置艺人** — 搜索走「本地 → Provider → 归一化 → 落库」，艺人详情按需同步关联作品；头像在无专用人像源时回退为该艺人真实专辑封面（仍为真实图片，不依赖防盗链）。

## 验收清单（需联网）

`node scripts/sync-once.js` 后，以下关键词都必须返回真实远程结果：

- [ ] `法老`
- [ ] `PACT`
- [ ] `aespa`
- [ ] `BLACKPINK`
- [ ] `G-DRAGON`
- [ ] `A$AP Rocky`
- [ ] 任意未写入本地数组的新艺人

每条结果需能展示：封面或头像、艺人关联、专辑/单曲类型、发行日期、详情页可打开、API 失败时有明确空状态。

> 已实测（2026-10-04，US storefront）：以上关键词与 `J. Cole`、`NewJeans`、`连麻` 均返回真实结果；`aespa` 二次搜索命中本地缓存（<10ms）。

## 验证命令

```powershell
npm run check                 # node --check server.js / public/app.js
npm test                      # tests/ 集成测试（离线，10 项）
$env:HIPKOP_PLAYER_PORT=4181
npm start
node scripts/sync-once.js     # 需要联网
```

## 后续 TODO

1. 接入**已授权**的 QQ 音乐 / 网易云 Provider（实现 `src/providers/index.js` 的契约并注册），以支持 `resolveQQListenSong` 与试听。
2. 如需 PostgreSQL：替换 `src/db.js` 驱动，`src/schema.js` 列名可直接迁移。
3. 真实用户评分/评论（当前榜单分数在无用户数据时为确定性编辑分，Provider 有真实热度时优先真实热度）。
4. 将 `data/media` 换成对象存储/CDN（`src/media.js` 只需替换写入与读取路径）。