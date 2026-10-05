# HIPKOP PLAYER · 信息架构与竞品研究

- 研究模式：vibe-research **Quick**（短不确定性检查 + 定向竞品扫描）
- 研究对象：HIPKOP PLAYER（跨曲风音乐榜单 + 文化社区，移动端 Web App）
- 平台：移动端 Web（竖屏手机壳，五 tab）
- 日期：2026-10-05
- 用途：直接指导首页改版，以及发现 / 榜单 / 详情 / 社区的信息架构调整

## 0. 一句话结论

五 tab 骨架成立，但首页 7 个区块实际只由 **3 个数据源**支撑：hero 轮播与「热评专辑榜」同源（都取自榜单），「新作」与「编辑推荐」同源（都取自 releases），「今日同频」也从 releases 抽。编排顺序仍是「播放器首页」范式。HIPKOP 的差异化应押注在 **「圈层（主流 HipHop / 地下 HipHop / K-POP）作为一等导航维度」+「作品级社区」**，并把「发现」从单纯搜索页升级为跨圈层入口枢纽。

## 1. 决策与范围（Quick 模式）

- **要回答的决策**：现有「hero 轮播 → 今日同频 → 榜单 → 社区」编排是否合理？发现 / 搜索入口、榜单维度（曲风 / 场景 / 年份 / 热度）、艺人页与专辑页信息层级、社区话题结构应如何调整？相对 QQ音乐 / 网易云 / Genius / Pitchfork / Bandcamp / AOTY 的差异化机会点在哪？
- **不确定性检查**：内部信息充分——本地有可执行实现（`public/app.js`、`src/api.js`）与逆向小程序一手素材；外部不确定性仅剩 Genius / Bandcamp / AOTY 抓取失败，已单列「待验证」，不据其下结论。
- **关键约束**：
  - 网络受限，仅引用实际抓取成功的 URL（见第 7 节）。
  - 数据侧尚无真实用户评分：`score` 来自 `src/normalize.js` 的确定性编辑分（7.4–9.6），UI 需明确口径。
  - 本次仅新增本文件，不改动其他代码。

## 2. 现状盘点（本地一手证据）

### 2.1 现有信息架构

| 层级 | 现状 | 证据 |
| --- | --- | --- |
| 全局导航 | 五 tab：首页 / 榜单 / 发现 / 社区 / 我的 | `public/index.html`（tabbar） |
| 首页 | hero 轮播 → 统计条 → 新作 → 今日同频 → 编辑推荐 → 热评专辑榜 → 最新评论 | `public/app.js:299-305` |
| 榜单 | 4 个 tab（综合 TOP50 / 主流 HipHop / 地下 HipHop / K-POP）× 3 个排序（榜单热度 / 综合评分 / 最新发行） | `public/app.js:381-393` |
| 发现 | 搜索框 + 筛选（bucket / scene / year / sort）+ 分组结果（艺人 / 专辑 / 单曲） | `public/app.js:415` 起；`src/api.js:163-185` |
| 社区 | 话题：全部 / 新作 / 安利 / 演出 / 乐评 / 闲聊；帖子字段 topic/title/body/author | `src/api.js:149-156`；`public/app.js:40-46` |
| 艺人页 | hero（背景图 + 头像 + 简介 + 关注）→ 代表专辑 → 关联单曲 | `public/app.js`（`artistDetail`） |
| 专辑页 | 封面 + 类型/年份/标签 + 标题 + 艺人 + 发行日期/曲目数/评分 + 收听 CTA + 收藏 + 编辑短评 + 曲目列表 | `public/app.js`（`renderAlbum`） |
| 收听 | `listen.platforms`（QQ 音乐 / 网易云 / Apple Music），detail 深链或搜索深链 | `src/listen.js`；`README.md` |
| 分桶 | `genre_bucket`（kpop / hiphop / other）+ `scene`（mainstream / underground） | `src/taxonomy.js`；`src/config.js` |

### 2.2 首页区块的真实数据关系（核心问题）

| 首页区块 | 取数来源 | 问题 |
| --- | --- | --- |
| hero 轮播 | `state.charts.slice(0, 5)`，即榜单热度前 5 | 与「热评专辑榜」同源，首屏与榜单位置重复 |
| 统计条 | `/api/health` 的 stats | 占首屏黄金位，但属后台指标，非用户决策信息 |
| 新作（横滑） | `/api/releases?limit=12` | 正常 |
| 今日同频 | releases 按「日序号取模」；「换一个」= releases 池随机 | 与新作同池，缺少新鲜感与推荐理由 |
| 编辑推荐 | `latest.slice(0, 4)`，同一 releases 数组 | 与新作同源，所谓「编辑推荐」无编辑动作 |
| 热评专辑榜 | `/api/charts?sort=popularity` | 没有真实用户评论/评分，「热评」名不副实 |
| 最新评论 | `/api/community/posts?limit=3` | 与专辑/艺人实体无关联，无法沉淀为作品内容 |

**结论**：7 个区块实际只有 3 个数据源（releases / charts / posts），且「热评」「编辑推荐」「今日同频」存在语义夸大；用户容易感到「内容少、重复、缺少推荐理由」。这是首页改版的根因，而不是视觉问题。

### 2.3 逆向小程序（Soundive）的首页编排对比

证据：`out_wx0870e45bb54e96f1/chunk_2.webview.js`（首页模板，按渲染索引顺序）、`out_wx0870e45bb54e96f1/app-config.json`（tabBar / 页面注册）、`Soundive_reverse_report.md`。

Soundive 首页区块顺序：

1. 新作
2. 艺人雷达
3. hero banner
4. 专栏
5. 今日同频
6. 热评专辑（「近 30 天热评专辑」）
7. 最新评论
8. 乐评榜
9. 关注动态

对比结论：

- Soundive 比当前 HIPKOP **多出**：艺人雷达（艺人发现）、专栏（编辑专题）、乐评榜、关注动态。
- Soundive 的 hero **不在最顶部**，前置「新作 + 艺人雷达」，更偏「内容货架」；HIPKOP 把 hero 顶格 + 统计条，更偏「播放器工具页」。
- Soundive 榜单体系含主题榜：`charts` / `chart-full` / `h1-top50` / `h1-top100` / `monthly-critics` / `hot-albums` / `recent-releases`，并有「2026 上半年中文说唱榜单」「年度最佳新人」「五大 Mixtape」等，说明「主题榜 / 年榜」是这类产品的重要内容形态，当前 HIPKOP 缺失。
- 两者的 tab 骨架一致（首页 / 榜单 / 发现 / 社区 / 我的），说明导航层无需大改，问题集中在**首页编排与维度深度**。

## 3. 竞品研究（仅使用已验证来源）

### 3.1 已验证：QQ音乐（y.qq.com）

已抓取：`https://y.qq.com/n/ryqq/toplist`、`https://y.qq.com/n/ryqq/toplist/4`、`https://y.qq.com/n/ryqq/newAlbum`。

- 顶部信息架构：首页 / 歌手 / 新碟 / 排行榜 / 分类歌单 / 雷达 / MV / 数字专辑 / 搜索。
- 榜单采用**四级货架**（来自 `toplist/4` 页面）：
  - 巅峰榜：飙升榜、热歌榜、新歌榜、流行指数榜、听歌识曲榜、MV 榜
  - 地区榜：内地榜、香港地区榜、台湾地区榜、欧美榜、韩国榜、日本榜、JOOX 本地热播榜、香港 TVB 劲歌金榜、台湾 KKBOX 榜
  - 特色榜：说唱榜、电音榜、游戏音乐榜、动漫音乐榜、影视金曲榜、综艺新歌榜、国风热歌榜、K 歌金曲榜、抖音热歌榜、DJ 舞曲榜、网络歌曲榜
  - 全球榜：美国公告牌榜、韩国 Melon 榜、英国 UK 榜、日本公信榜
- 榜单页展示：更新时间、榜单规则、播放全部、批量操作、评论数。
- 启示：QQ 有独立「说唱榜」和「韩国榜」，但**没有「地下 / 主流」圈层维度**，也没有把跨语种听众「放在一起」的产品表达。

### 3.2 已验证：网易云音乐（music.163.com）

已抓取：`https://music.163.com/discover`、`https://music.163.com/discover/toplist`。

- 发现首页结构：热门推荐（banner + 风格筛选：华语 | 流行 | 摇滚 | 民谣 | 电子）→ 新碟上架 → 榜单。
- 榜单体系含更新频率标注（如「刚刚更新 / 每周五更新 / 每天更新」），并包含：网易云中文说唱榜、网易云全球说唱榜、网易云韩语榜、网易云摇滚榜、网易云国风榜、美国 Billboard 榜、日本 Oricon 榜等。
- 启示：网易云**曲风维度与更新频率很细**，但同样没有「主流 vs 地下」的场景轴；榜单是「媒体榜 + 平台榜」混合，社区/评论虽强，但作品与话题未形成结构化关联。

### 3.3 已验证：Pitchfork（pitchfork.com）

已抓取：`https://pitchfork.com/reviews/albums/`、`https://pitchfork.com/best/`。

- 主导航：News / Reviews / Best New Music / Features / Lists / Columns / Video / Search。
- Reviews → Albums 下再分：Albums、Best New Albums、Best New Reissues、8.0+ reviews、Sunday Reviews、Tracks。
- 列表项带：曲风标签（如 Experimental / Rap、Pop/R&B）、艺人、编辑署名、日期；Best New Music 是明确的「当前最佳」编辑位。
- 启示：Pitchfork 的核心资产是**编辑权威 + 可比较分值（0–10）+ 署名**；它没有用户社区，也没有曲风分桶导航，更偏「媒体评论」而非「听众广场」。

### 3.4 已验证：Apple Music（music.apple.com/us/new）

已抓取：`https://music.apple.com/us/new`（页面编码显示异常，仅确认到导航与编辑位结构）。

- 结构：搜索 / 主页 / 新发现 / 广播；「新发现」以编辑歌单（如 A-List: 国语流行）与艺人焦点内容为主。
- 启示：官方语境下的「编辑歌单 / 焦点」推荐形态，无 UGC 社区与跨圈层场景维度。

### 3.5 待验证（抓取失败，不做结论）

| 产品 | 抓取结果 | 需验证的问题 | 验证方法 |
| --- | --- | --- | --- |
| Genius（genius.com） | 连接失败 / 超时 | 歌词 + 注释（annotation）社区如何组织作品页与用户贡献 | 联网环境直接打开 `https://genius.com/` 与任一歌曲页，记录版面区块顺序 |
| Bandcamp（bandcamp.com/discover） | 超时 | 独立音乐/厂牌/粉丝收藏与购买的关系，标签（tag）如何做发现 | 打开 `https://bandcamp.com/discover` 与 `https://bandcamp.com/tag/hip-hop`，记录发现入口 |
| Album of the Year（albumoftheyear.org） | HTTP 403 | 用户打分聚合、年榜、用户评论与评分分布的产品形态 | 用真实浏览器访问 `https://www.albumoftheyear.org/` 与 `/2026/`，记录评分聚合方式 |

> 说明：上述三家在公开认知里分别是「歌词社区 / 独立音乐 / 评分聚合」方向，但本次未能成功抓取原文，故**不在此断言其具体功能**，一律以「待验证」处理。

### 3.6 差异化机会点

| 机会 | 依据 | HIPKOP 可落点 |
| --- | --- | --- |
| 圈层作为一等维度 | QQ/网易云有曲风榜，但都无「主流 / 地下」场景轴 | 榜单/发现/艺人页统一暴露「主流 HipHop / 地下 HipHop / K-POP」三圈层 |
| 跨圈层「同频」 | 竞品按语种/曲风分隔，K-POP 与说唱听众互不打通 | 首页「今日同频」做成跨圈层推荐，并配推荐理由 |
| 作品级社区 | 网易云评论强但依附歌曲；Pitchfork 无社区 | 帖子可挂到 album/artist 实体，形成「作品内容层」 |
| 编辑口径透明 | 现有 `score` 为确定性编辑分，却被用于「热评榜」 | 明确标注「编辑分 / Provider 热度 + 更新时间」 |
| 全球且本地化 | Soundive 只做中文说唱 | 已有 iTunes US/KR/CN + MusicBrainz + Deezer，可覆盖全球 HipHop、地下与 K-POP |

## 4. 可执行改版建议

### R1. 断开首页同源重复，明确每个区块的数据职责

- **现状**：hero 与「热评专辑榜」都取 `/api/charts`；「新作」与「编辑推荐」都取 `/api/releases`；「今日同频」也从 releases 取（`public/app.js:289-305`、`public/app.js:327-331`、`public/app.js:637-641`）。
- **建议**：给每个区块固定一个**互斥的来源与排序**——hero=编辑精选（跨三圈层各 1，附推荐语）；新作=`/api/releases`；今日同频=按 `scene`+`bucket` 轮转的跨圈层单曲/专辑（带推荐理由）；「编辑推荐」若保留则改为「编辑专题」（作品集合），否则删除；榜单独占 `/api/charts`。
- **预期收益**：首屏起不再出现重复封面；7 个区块形成信息梯度，提升向下滚动深度与详情页点击率。

### R2. 重排首页区块（见第 5 节），把「圈层导航」提到首屏

- **现状**：hero 顶格 + 统计条挤占首屏；三圈层只在榜单/发现页的筛选里出现（`public/app.js:381-393`、`public/app.js:415` 起）。
- **建议**：按第 5 节顺序，将「三圈层快捷入口」上提到 hero 之后；统计条下移或压缩。
- **预期收益**：首屏完成「你是谁 + 今天看什么」的表达，跨圈层定位被立即感知，降低跳出。

### R3. 榜单维度结构化：曲风 × 场景 × 年份 × 热度，并标注口径与更新频率

- **现状**：榜单仅 4 tab × 3 sort，无年份维度、无更新频率、无口径说明，且「综合评分」来自确定性编辑分（`public/app.js:381-393`；`src/normalize.js` `editorialScore`）。
- **建议**：一级 tab 保持「综合 / 主流 / 地下 / K-POP」；新增二级维度：年份（全部 / 今年 / 近三年 / 历年）、类型（专辑 / 单曲 / 艺人）、场景；每个榜单标题旁固定展示「口径（编辑分 / Provider 热度）+ 更新时间」；把筛选状态写入 URL（如 `#/charts?scene=underground&year=2026&sort=popularity`）。
- **预期收益**：对齐 QQ/网易云「多榜单货架」的使用习惯，同时用「地下/主流」制造竞品没有的差异；口径透明提升可信度。

### R4. 把「发现」升级为跨圈层入口枢纽

- **现状**：发现页只有搜索框 + 筛选 + 结果，且顶部 header 另有一个重复的「发现」按钮（`public/index.html`；`public/app.js:415` 起）。
- **建议**：发现页首屏 = 搜索（带热搜词 / 最近搜索）+ 三圈层入口卡 + 场景与年份入口 + 编辑专题（专栏）；移除 header 中重复的「发现」按钮，改为搜索图标直达；参考 Soundive 的「艺人雷达 / 专栏」补足「按人发现」与「按专题发现」。
- **预期收益**：让「发现」承担导航职责，缩短「打开 App → 找到想看的内容」路径，提升搜索与筛选使用率。

### R5. 补齐艺人页与专辑页信息层级

- **现状**：艺人页 = hero + 简介 + 关注 → 代表专辑 → 关联单曲；专辑页 = 封面/标题/艺人/发行/曲目/评分/收听/收藏/编辑短评/曲目表。
- **建议**：
  - 艺人页：增加圈层/场景标签与资料来源、最新发行时间线、热门单曲 Top5、相关艺人（同场景/同曲风）、该艺人的社区话题聚合。
  - 专辑页：评分旁标注口径；把 `listen.platforms` 从「弹层」提升为显性「多平台收听」模块；新增社区入口（「安利这张专辑」）与相关专辑/同艺人作品。
- **预期收益**：详情页从「元数据展示」升级为「内容 + 社区」闭环，提升停留时长与互动量。

### R6. 社区话题结构化，并与专辑/艺人实体关联

- **现状**：话题仅 全部 / 新作 / 安利 / 演出 / 乐评 / 闲聊，帖子只有 topic/title/body/author，无实体关联、无排序、无话题页（`src/api.js:149-156`、`src/api.js:313-330`）。
- **建议**：话题模型升级为「话题 + 关联实体（album/artist id）+ 类型」；新增话题详情页、热门/最新排序、点赞与投票（如「年度最佳 Rap Album」）；在专辑/艺人页内嵌相关帖子流；设计跨圈层话题（如「用一首 K-POP 入门说唱」）。
- **预期收益**：社区从「留言板」变成「围绕作品的内容层」，同时为未来的真实评分/用户榜沉淀数据。

### R7. 数据可信度：空态与离线标注做到「数据源级」

- **现状**：`state.offline` 仅在 releases/charts/health 全部失败时才为真，部分失败时 fallback 示例数据会与真实数据混排（`public/app.js:279-291`、`public/app.js:207`）。
- **建议**：fallback 数据逐条标记「离线示例」；「热评/评分/热度」统一展示口径与来源；榜单/详情展示「最后更新时间」。
- **预期收益**：避免演示数据被误认为真实榜单，保护产品的编辑可信度。

## 5. 首页建议区块顺序

> 单列如下（自上而下），替换现有 `public/app.js:299-305` 的编排。

1. **顶部栏**：品牌 + 搜索入口（直达发现/搜索）+ 登录。
2. **Hero 轮播**：编辑精选，跨三圈层各 1 张，每张带一句「为什么现在推荐」。
3. **今日同频**：每日 1 张跨圈层作品，带推荐语与推荐来源（编辑或社区）。
4. **三圈层快捷入口**：主流 HipHop / 地下 HipHop / K-POP 三张卡，直达对应榜单与发现。
5. **新作横滑**：`/api/releases` 真实新作。
6. **编辑榜 TOP10**：明确标注口径（编辑分 / Provider 热度）与更新时间；命名避免用「热评」。
7. **社区精选**：2–3 条与专辑/艺人关联的帖子（安利 / 乐评）。
8. **编辑专题 / 专栏**：当前缺失、Soundive 已验证的重要形态。
9. **关注动态**：登录后可见（预留位）。

**排序理由**：现有编排「hero 顶格 + 统计条」是播放器/工具首页范式；HIPKOP 定位是「榜单 + 文化社区 + 跨圈层」，首屏应先回答「你是谁（三圈层）」和「今天看什么（hero / 今日同频）」，再下沉到「我关注谁（关注动态）」。统计条从首屏移除或压缩为页脚细体一行，避免占用黄金位置。

## 6. Handoff Context

| 字段 | 内容 |
| --- | --- |
| App | HIPKOP PLAYER |
| 平台 | 移动端 Web App（竖屏手机壳，五 tab） |
| 用户层级 | 未明确（假设：全球 HipHop / 地下说唱 / K-POP 听众，含中文用户） |
| 模式 | vibe-research Quick |
| 预算 / 时间线 | 未提供 |
| 约束 | 网络受限；无真实用户评分；本次仅允许新增 `docs/research-HIPKOP.md` |
| 关键决策 | 五 tab 保留；首页区块重排（第 5 节）；圈层提为一等维度；榜单补年份/口径；发现升级为枢纽；社区与作品实体关联 |
| 关键源文件 | `public/app.js`、`public/index.html`、`src/api.js`、`src/taxonomy.js`、`src/normalize.js`、`src/config.js`、`src/listen.js`、`README.md`、`Soundive_reverse_report.md`、`out_wx0870e45bb54e96f1/`（`chunk_2.webview.js`、`app-config.json`） |
| 待解问题 | Genius / Bandcamp / AOTY 产品形态（见 3.5）；是否引入真实用户评分；是否支持主题榜/年榜；登录与关注体系是否在首版上线 |

## 7. 来源

### 本地来源（一手）

- `D:\hipkop-player\README.md`（现有功能、API、Provider 边界、首页结构说明）
- `D:\hipkop-player\Soundive_reverse_report.md`（Soundive 逆向报告：页面清单、云开发、外部平台）
- `D:\hipkop-player\out_wx0870e45bb54e96f1\`（Soundive 逆向源码）
  - `chunk_2.webview.js`（首页模板区块顺序与标题：「新作 / 艺人雷达 / 专栏 / 今日同频 / 热评专辑 / 最新评论 / 乐评榜 / 关注动态」）
  - `app-config.json`（tabBar：首页 / 榜单 / 发现 / 社区 / 我的；页面注册）
  - `pages/`（charts、chart-full、h1-top50、h1-top100、monthly-critics、hot-albums、recent-releases、category、features、album-detail、artist 等）
  - `app-service.js`（主题榜文案：「2026 上半年中文说唱榜单」「年度最佳新人」「五大 Mixtape」等）
- `D:\hipkop-player\public\index.html`（五 tab 导航）
- `D:\hipkop-player\public\app.js`（首页编排 299-305、hero 246-264、releases 抽取 289-305、dailyPick 327-331、randomPick 637-641、榜单 381-393、发现 415 起、详情/艺人页）
- `D:\hipkop-player\src\api.js`（社区话题 149-156、榜单 285-299、专辑筛选 256-262）
- `D:\hipkop-player\src\taxonomy.js`（genre_bucket / scene）
- `D:\hipkop-player\src\normalize.js`（editorialScore / editorialPopularity 确定性编辑分）
- `D:\hipkop-player\src\config.js`（主流 / 地下艺人名单、seed 艺人）
- `D:\hipkop-player\src\listen.js`（QQ 音乐 / 网易云 / Apple Music 收听深链）

### 已验证 URL（本次实际抓取成功）

- QQ音乐排行榜：`https://y.qq.com/n/ryqq/toplist`
- QQ音乐流行指数榜（含完整榜单货架）：`https://y.qq.com/n/ryqq/toplist/4`
- QQ音乐新碟：`https://y.qq.com/n/ryqq/newAlbum`
- 网易云发现首页：`https://music.163.com/discover`
- 网易云排行榜：`https://music.163.com/discover/toplist`
- Pitchfork 专辑评论：`https://pitchfork.com/reviews/albums/`
- Pitchfork Best New Music：`https://pitchfork.com/best/`
- Apple Music 新发现：`https://music.apple.com/us/new`（页面编码异常，仅确认导航与编辑位）

### 待验证（本次未成功抓取，不做结论）

- `https://genius.com/`（连接失败 / 超时）
- `https://bandcamp.com/discover`（超时）
- `https://www.albumoftheyear.org/`（HTTP 403）
- 百科类站点（`en.wikipedia.org` 等）本次同样超时，未使用

**建议的验证方法**：在可访问的网络环境用真实浏览器打开上述 URL，按第 3.5 节列出的观察项（版面区块顺序、发现入口、评分/标签组织方式）逐条记录后回填本文件。
