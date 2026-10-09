# HIPKOP PLAYER

HIPKOP PLAYER 是面向 **全球 HipHop/Rap + K-POP** 听众的竖屏音乐体验 MVP。它保留五 tab 信息架构、专辑/单曲/艺人详情、榜单、发现专题、社区和个人收藏路径，并在此基础上接入**真实的音乐元数据目录**。

## 已实现

- 竖屏手机壳：首页 / 榜单 / 发现 / 社区 / 我的
- **曲风分桶**（`src/taxonomy.js`）：统一为 HipHop / K-POP / 其他三档，榜单与发现共用一条 `genre_bucket` 轴，不再区分「主流 / 地下」
- **艺人分桶 Agent**（`src/agents/`，`npm run agent:taxonomy`）：iTunes 的艺人行九成没有流派，因此改按艺人自有专辑的流派分布投票分桶，置信度不足就挂起等更多数据。专辑桶与艺人桶共用同一套关键词，含韩文 `힙합/랩`、日文 `ヒップホップ／ラップ`、中文 `说唱` 等非拉丁标签；填上 `DEEPSEEK_API_KEY` 即可接 DeepSeek 官方 API 处理低置信度样本
- **SQLite 元数据目录**（Node 内置 `node:sqlite`，零依赖）：`artists` / `albums` / `tracks` / `album_artists` / `track_artists` / `metadata_sources` / `cover_cache` / `sync_jobs` / `community_posts` / `album_aliases`
- **合法、稳定的元数据 Provider**：iTunes/Apple Music（封面 + 作品，无需 Key）、MusicBrainz（艺人资料富化，无需 Key），可选 Deezer（艺人头像）与 Last.fm（需 `LASTFM_API_KEY`）
- **搜索**：本地目录优先，结果不足时调用 Provider，归一化后落库并建立艺人-专辑-曲目关联；结果按 艺人 / 专辑 / 单曲 分组
- **真实封面与头像**：服务端把第三方图下载到本地缓存，前端只使用 `/media/...`
- **封面代理 / 本地缓存 / 失败重试**：指数退避 + 失败记录 + 占位图
- **听完整版而不是试听片段**：每个专辑/单曲都带 `listen.platforms`（QQ 音乐 / 网易云 / Apple Music）。有授权 ID 时用精确 detail 链接，否则用平台的搜索深链；前端「在 QQ 音乐听完整版 ↗」直接跳转，另可打开「选择收听平台」弹层
- **数据库校准**（`src/calibrate.js`）：合并跨 storefront 的重复专辑/曲目、合并桩艺人、回填发行日期 / 曲目数 / 艺人展示名、封面统一到 900px 主图、重算分桶；`/api/sync/calibrate` 幂等可重复执行。已由 Agent 提交的艺人分桶不会被回填覆盖
- **API**：`/api/search`、`/api/albums`（筛选）、`/api/albums/:id`、`/api/artists/:id`、`/api/tracks/:id`、`/api/releases`、`/api/charts`、`/api/categories`、`/api/community/posts`、`/api/sync/*`
- **社区**：`community_posts` 落库，支持按 topic（安利 / 新作 / 演出 / 乐评 / 闲聊）浏览与发帖
- **定时同步**：每日新作、每周榜单（Apple 榜单 RSS，us/kr/jp 多区合并、各专辑取最好名次）、每日艺人资料刷新、每日校准、每日艺人分桶，失败重试与退避
- **首页结构对齐 Soundive 小程序**：hero 轮播 → 统计条 → 新作横滑 → 今日同频 → 编辑推荐 → 热评专辑榜 → 最新评论
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
npm run agent:taxonomy       # 艺人分桶 dry-run
npm run agent:taxonomy -- --apply --limit 500   # 落库
```

部署到公网（Docker / PaaS / 隧道三条路径）：见 [docs/DEPLOY.md](docs/DEPLOY.md)。

```bash
cp .env.example .env          # 必须配置 HIPKOP_DOMAIN、HIPKOP_ADMIN_TOKEN
# 先按 docs/DEPLOY.md 迁移私有数据库和封面，再启动 HTTPS 服务
docker compose up -d --build
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
src/taxonomy.js            曲风分桶关键词（专辑与艺人共用）+ scene 策展
src/agents/                艺人分桶 Agent（classify / model / taxonomy）
src/listen.js              QQ 音乐 / 网易云 / Apple Music 收听深链
src/calibrate.js           数据库校准（去重、回填、封面归一化）
src/sync.js                同步任务与执行器（含退避重试）
src/scheduler.js           每分钟 drain 到期任务
src/api.js                 JSON API 与序列化
src/providers/              Provider 实现与注册表
public/                    前端（app.js 由 API 驱动）
tests/catalog.test.js      node --test 目录 / API 集成测试（不依赖网络）
tests/calibration.test.js  校准、分桶、收听深链与社区 API 测试
scripts/sync-once.js       一次性同步
data/                      SQLite 与媒体缓存（已 gitignore）
```

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/search?q=&type=&page=&pageSize=` | 分组搜索（artists/albums/tracks） |
| GET | `/api/artists/:id` | 艺人资料 + 关联专辑 + 关联单曲 |
| GET | `/api/albums?bucket=&scene=&year=&sort=&limit=` | 目录浏览（bucket: all/hiphop/kpop/other，scene: all/mainstream/underground） |
| GET | `/api/albums/:id` | 专辑 + 艺人 + 曲目 + `listen.platforms` |
| GET | `/api/tracks/:id` | 单曲 + 艺人 + 所属专辑 |
| GET | `/api/releases?from=&to=&limit=` | 按发行日期的新作 |
| GET | `/api/charts?genre=&scene=&sort=&limit=` | 榜单（genre: all/hiphop/rap/kpop，scene: all/mainstream/underground，sort: popularity/score/date） |
| GET | `/api/categories` | 分桶 / 场景统计与社区 topic |
| GET | `/api/community/posts?topic=&limit=` | 社区帖子（可按 topic 过滤） |
| POST | `/api/community/posts` | 发帖（`{topic,title,body,author?}`） |
| POST | `/api/sync/calibrate` | 立即执行一次数据库校准，返回前后一致性报告 |
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
| `HIPKOP_MAINSTREAM_ARTISTS` | 见 config | 主流艺人名单（`scene=mainstream`），逗号分隔 |
| `HIPKOP_UNDERGROUND_ARTISTS` | 见 config | 地下艺人名单（`scene=underground`），逗号分隔 |
| `HIPKOP_CHART_GENRES` | `rap,kpop` | 榜单同步按风格抓取的类别 |
| `HIPKOP_DISABLED_PROVIDERS` | 空 | 禁用的 Provider |
| `LASTFM_API_KEY` | 空 | 开启 Last.fm（艺人头像/简介） |
| `HIPKOP_SCHEDULER` | `1` | 设为 `0` 关闭后台同步 |
| `HIPKOP_DAILY_SYNC_HOUR` | `4` | 每日同步小时 |
| `DEEPSEEK_API_KEY` | 空 | 填上就自动启用 Agent 的模型后端（DeepSeek 官方 API） |
| `HIPKOP_AGENT_URL` | 有 Key 时指向 DeepSeek | 任意 OpenAI 兼容的 `/chat/completions` 端点 |
| `HIPKOP_AGENT_KEY` | 取 `DEEPSEEK_API_KEY` | 覆盖 Key，用于非 DeepSeek 端点 |
| `HIPKOP_AGENT_MODEL` | `deepseek-chat` | 模型名 |
| `HIPKOP_AGENT_MIN_CONFIDENCE` | `0.7` | 分桶落库的置信度阈值 |
| `HIPKOP_AGENT_BATCH` | `50` | 每次请求提交的艺人数量 |
| `HIPKOP_AGENT_TIMEOUT_MS` | `30000` | 单次请求超时 |

### 用 DeepSeek 驱动分桶 Agent

Agent 默认完全离线。想让它处理「专辑只标了 Pop / Dance / Music」这类灰色样本，给一个 Key 就行：

```powershell
Copy-Item .env.example .env
# 编辑 .env，填上 DEEPSEEK_API_KEY=sk-xxxx
npm run agent:taxonomy -- --probe               # 先探活，只打印模型判定，不写库
npm run agent:taxonomy -- --apply --limit 500   # 落库
```

部署到公网（Docker / PaaS / 隧道三条路径）：见 [docs/DEPLOY.md](docs/DEPLOY.md)。

```bash
cp .env.example .env          # 可选：填 DEEPSEEK_API_KEY
docker compose up -d --build  # http://127.0.0.1:8080/api/health
```
```

`npm start` / `npm run sync` / `npm run agent:taxonomy` 都会自动加载根目录的 `.env`（用 Node 自带的 `--env-file-if-exists`，不引入依赖）；没有 `.env` 时只提示一行，不影响运行。`.env` 已在 `.gitignore` 里，Key 不会被提交。

换其它 OpenAI 兼容端点（含自建代理）时设 `HIPKOP_AGENT_URL` + `HIPKOP_AGENT_KEY` + `HIPKOP_AGENT_MODEL`。URL 可以只写到 base（`https://api.deepseek.com` 或 `.../v1`），路径会自动补成 `/chat/completions`。任何失败——Key 无效、余额不足、超时、模型答了段散文——都只记一条 warning 并退回本地规则，同步任务不会中断。

## Provider 与许可

- **iTunes / Apple Music Search API**：公开、无需 Key，仅用于元数据与封面链接；本服务把图片缓存到本地后使用。
- **MusicBrainz**：CC0，用于艺人国家/流派/简介等富化，需带 `User-Agent`。
- **Deezer**：公开无需 Key，提供艺人头像；网络不可达时自动进入冷却、不影响搜索。
- **Last.fm**：需 `LASTFM_API_KEY`，提供艺人头像与简介。
- 未接入网易云/QQ 私有接口或登录 Cookie。将来接入已授权的 QQ/网易云 Provider 时，只需实现 `src/providers/index.js` 中的 Provider 契约并注册。
- **收听跳转不是抓取**：`src/listen.js` 只生成平台公开的网页地址（detail 或搜索深链），播放仍发生在 QQ 音乐 / 网易云 / Apple Music 自己的客户端或网页内。

## 同步与重试

- `sync_jobs` 使用 `status + next_run_at` 调度，失败按 `30s * 2^(attempts-1)` 指数退避，最多 `max_attempts` 次。
- 活跃任务用部分唯一索引去重；重启后按 `last done + interval` 重新排期，不会重复抓取。
- 详情页在数据为空时按需触发一次同步；`cover_cache` 记录每次下载的尝试与错误。
- 每次 releases / charts / artist-refresh 结束后自动跑一次校准；`/api/sync/calibrate` 可随时手动执行。

## 数据一致性

`GET /api/health` 的 `consistency` 字段是一份可直接观察的体检报告：

- `albumsMissingCover` / `albumsMissingReleaseDate` / `albumsWithoutArtist`
- `tracksWithoutAlbum` / `tracksMissingArtist`
- `duplicateAlbums` / `duplicateTracks` / `duplicateArtists`
- `stubArtists` / `stubAlbums`（尚无 Provider 对应记录的占位行）

校准会把这些计数收敛到 0（`stubArtists` 例外：确实没有上游记录的艺人会保留为占位行）。同一个专辑在不同 storefront 的多个 ID 会被合并，并写入 `album_aliases`，后续同步会更新到同一条主记录，而不是再生成重复项。

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

校准与收听跳转自测：

```powershell
# 触发一次校准，看 before/after 是否收敛
Invoke-RestMethod -Method POST http://127.0.0.1:4181/api/sync/calibrate | ConvertTo-Json -Depth 5
# 一致性（duplicate* 应为 0）
Invoke-RestMethod http://127.0.0.1:4181/api/health | Select-Object -Expand consistency
# 任意未预置艺人：应返回艺人 + 真实头像 + 关联作品，且详情页有 QQ 音乐跳转
Invoke-RestMethod "http://127.0.0.1:4181/api/search?q=Yerin%20Baek"
```

## 边界

本项目只同步**元数据与封面**，不下载、不转存、不分发任何音频；`previewUrl` 仅作为试听片段链接。完整收听通过平台公开网页地址跳转（QQ 音乐 / 网易云 / Apple Music），不在本服务内代理或缓存音频。榜单评分在没有真实用户评分前使用基于稳定元数据的**确定性编辑分**（UI 标注为编辑口径），Provider 提供真实热度时以真实热度优先。
