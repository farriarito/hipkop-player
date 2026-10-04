# HIPKOP PLAYER：同步数据库接手说明

> 当前日期：2026-10-04

## 现状

当前网页位于 `outputs/hipkop-player`，已具备竖屏页面、专辑/单曲/艺人详情、榜单排序、新作横滑和基础搜索。

但前端仍不能等同 Soundive：Soundive 的完整目录在微信云开发后端，不在 wxapkg 包内。解包得到的只是调用契约。

## Soundive 已确认的数据链路

前端调用：

- `getAlbums({ keyword, page, pageSize })`
- `getAlbums({ id })`
- `getArtists({ keyword, limit })`
- `getArtist({ id })`
- `getLatestAlbums`
- `syncAlbumTracks`
- `resolveQQListenSong`

专辑数据包含：

`coverUrl`, `sourcePlatform`, `sourceId`, `neteaseArtistId`, `qqAlbumMid`, `qqListenSongMid`, `artistIds`, `ownerArtistIds`, `tracks`, `releaseDate`, `avgScore`, `reviewCount`。

源码还明确出现 QQ 音乐和网易云链接：

- `music.163.com`
- `p*.music.126.net`
- `y.qq.com`
- `y.gtimg.cn`

因此 Soundive 的模式是“自有目录数据库 + 多平台元数据同步”，不是前端写死，也不是单纯实时爬网页。

## 下一位开发者必须完成

### 1. 选择合法、稳定的数据源

不要把网易云/QQ 私有接口或登录 Cookie 写进前端。优先顺序：

1. 取得 QQ 音乐/网易云/Spotify 等官方或授权 API；
2. 无授权时使用 iTunes Search、MusicBrainz、Last.fm 等公开元数据服务；
3. 对封面和艺人头像进行本地缓存，并保留来源与许可字段。

### 2. 建立数据库

建议 PostgreSQL（生产）或 SQLite（本地开发）。最少表：

- `artists`
- `albums`
- `tracks`
- `album_artists`
- `track_artists`
- `metadata_sources`
- `sync_jobs`
- `cover_cache`

核心唯一键：

- `artists(provider, provider_artist_id)`
- `albums(provider, provider_album_id)`
- `tracks(provider, provider_track_id)`

### 3. 建立 Provider 接口

```ts
interface MusicProvider {
  search(query: string): Promise<{
    artists: Artist[];
    albums: Album[];
    tracks: Track[];
  }>;
  getArtist(id: string): Promise<Artist>;
  getAlbum(id: string): Promise<Album>;
  getTrack(id: string): Promise<Track>;
}
```

实现 `itunesProvider`、`musicbrainzProvider`，将来再接已授权的 QQ/网易云 Provider。

### 4. 统一归一化模型

不要让页面直接依赖某个平台字段。统一成：

```ts
{
  id,
  title,
  artistIds,
  albumId,
  coverUrl,
  releaseDate,
  genre,
  source: { provider, providerId },
  syncedAt
}
```

### 5. API 路由

建议新增：

```text
GET /api/search?q=&type=&page=
GET /api/artists/:id
GET /api/albums/:id
GET /api/tracks/:id
GET /api/releases?from=&to=
GET /api/charts?genre=&sort=
POST /api/sync/search
POST /api/sync/album/:id
```

### 6. 搜索逻辑

搜索流程应为：

```text
用户输入
→ 先查本地数据库
→ 本地不足时调用 Provider
→ 归一化并写入数据库
→ 建立艺人-专辑-曲目关系
→ 返回真实封面与头像
```

搜索结果必须分组：

- 艺人
- 专辑
- 单曲

### 7. 封面同步

- Provider 返回原图 URL；
- 服务端下载到对象存储或本地缓存；
- 生成缩略图；
- 页面只使用自己的 `/media/...` URL；
- 下载失败保留外部 URL和 `sync_status=failed`；
- 不能让前端直接依赖不稳定的第三方图片防盗链。

### 8. 定时同步

增加任务：

- 每日同步新发行；
- 每周刷新榜单；
- 详情页按需刷新曲目与艺人资料；
- 失败重试与指数退避；
- 记录 `last_synced_at`、`sync_error`。

### 9. 前端改造

将 `public/app.js` 中的静态 `albums/artists/singles` 替换为 API 加载：

- 首页调用 `/api/releases`；
- 发现页调用 `/api/search`；
- 艺人页调用 `/api/artists/:id`；
- 专辑页调用 `/api/albums/:id`；
- 榜单调用 `/api/charts`。

本地静态数据只能保留为离线 fallback，不得作为主要搜索源。

### 10. 验收标准

以下关键词均必须返回真实远程结果，而非预置数组：

- `法老`
- `PACT`
- `aespa`
- `BLACKPINK`
- `G-DRAGON`
- `A$AP Rocky`
- 任意未写入本地数组的新艺人

每条结果需能展示：

- 封面或头像；
- 艺人关联；
- 专辑/单曲类型；
- 发行日期；
- 详情页可打开；
- API 失败时有明确空状态。

## 当前验证命令

```powershell
node --check public/app.js
node --check server.js
$env:HIPKOP_PLAYER_PORT=4181
npm start
```

## 当前限制

当前目录不是 Git 仓库，而且没有发现可用的远端仓库 URL。推送前需要：

1. 提供 GitHub/Gitee 仓库地址；或
2. 在该目录执行 `git init` 并添加 remote；或
3. 将此目录复制到已有 Git worktree 后提交。
