# HIPKOP / 唱片展览 × 音乐刊物

2026-10-08。本轮保留原生 JavaScript、Node、SQLite、元数据 Provider 和现有五个 tab，不新建孤立 Demo，不迁移 React。

## 用户要求

- 首页顶部品牌文案与主视觉定位均为 `HipHop&K-POP`。
- `HEAR EACH OTHER.` 旁采用独立七段声波；不使用专辑封面、背景图片或数据库 URL 填充标识。
- 删除“听见不同。找到同类。加入这场对话”整块，不是仅隐藏截图。
- “编辑推荐”改为“私人雷达”；“编辑榜 TOP10”改为“今日top10”，无编辑分、每日更新小字。
- 榜单页面标题仅“榜单”，保留分类与排序；删除 Provider 和排序口径长说明。
- 使用“为小程序设计Logo”对话里的耳机 + H 原版 SVG，顶部、favicon、唱片架共用。

## 统一视觉系统

- 展场纸色 `#e7e1d5`，石墨字色 `#252622`，舞台红 `#b32e24`。
- 酸绿 `#cced63` 用于真实播放状态与播放键；同色系信号绿用于定位标签与克制的封面交互反馈。
- 本地 Outfit 字体 + 系统中文无衬线；不请求远程字体。中文标题不用宋体，强调年轻音乐刊物的排版力度。
- 首页是一座石质唱片装置：唱片沟槽、刻度、红织物、碎片均由本地分层 SVG 绘制，不依赖作品封面。
- 元数据封面保持原色；封面缺失继续使用已有的降级方案，不伪造“已同步”。
- 手机优先，最大宽度 520px，桌面仍是相同的竖屏小程序体验。
- 作品、艺人、发现、社区、收藏、弹层、播放器统一纸色/红色/直角基调。
- 新作保持按发行时间横向滚动；私人雷达双列错位展示。

## 动效技能与实现

使用 `gsap-core`、`gsap-timeline`、`gsap-scrolltrigger`、`gsap-utils`、`gsap-performance`，
结合 `design-taste-frontend`、`redesign-existing-projects`、`high-end-visual-design`、`brandkit` 的相关设计原则。
未引入与当前原生 JS 栈无关的 React/Vue/Svelte 包。

- 首屏分层时间线：标识、标题、石质主体、红织物、操作区依次入场。
- 原生滚动驱动装置和织物轻视差；不 pin、不劫持触控。
- 章节滚动进入；新作封面、私人雷达封面和今日top10逐行错峰进入。
- 桌面指针驱动最大 ±3° 轻倾斜，`quickTo` 复用 Tween，`clamp` 限幅。
- 唱片旋转和低频绿环仅跟随 HTMLAudioElement 的真实 `playing` 状态。
- 暂停、离屏或后台停止持续动画；切页撤销 matchMedia 和监听器。
- 推荐“换一个”、弹层和按压有短反馈。
- `prefers-reduced-motion` 下无持续旋转、无 ScrollTrigger；业务功能保留。
- GSAP 无法加载时内容不被 CSS 隐藏，导航、推荐和播放仍可操作。
- SVG 使用确定性的点状石纹；移除动态主体上的噪声滤镜，减少纹理路径数量，降低移动设备开销。

## 真实功能保留与集成

- `今天听点儿` 换一个排除当前作品，只重绘该组件。
- API 搜索、艺人关联作品、作品详情、三类榜单和全部排序保留。
- SQLite 数据与 API 未替换成预写好的搜索结果。
- 持续播放器位于 `#view` 外，页面切换不重建音频；仅试听现有 Provider 提供的片段。
- 收藏立即刷新按键状态，并保存到本设备 localStorage。
- 社区发帖弹层保持可操作；本轮不新增社区数据库结构。

“私人雷达”仍是目录推荐模块的更名，不代表已经实现账号画像/个性化模型。
视觉升级不等同于曲库、图片或 Provider 的数据同步升级。

## 运行与验收

```powershell
npm ci
npm start
npm run build
npm test
# 对运行中的服务器执行真实浏览器验收
$env:HIPKOP_UI_URL='http://127.0.0.1:4185'
npm run test:ui
```

默认服务端口仍为 4180。当前会话验收实例使用 4185，避免干扰原服务进程。
Windows 验收使用已安装 Chrome；其他环境可先安装 Playwright Chromium。

`npm run build` 包括全部本地前端 JS 的 TypeScript 检查、语法检查和原生生产打包。
`npm run test:ui` 对真实 API 和音频执行验收，不模拟成功响应；
报告和截图生成到 `docs/exhibition-verification/`。

## 文件职责

- `public/exhibition.css`：当前统一视觉，覆盖旧 `style.css` 的基础功能样式。
- `public/exhibition.js`：首页舞台模板与不依赖 GSAP 的播放状态展示。
- `public/exhibition-art.js`：本地分层唱片雕塑。
- `public/motion.js`：GSAP 时间线、滚动、指针和播放动画生命周期。
- `public/player.js`：持续真实试听播放器。
- `public/app.js`：目录、路由、五 tab、推荐、详情、社区、收藏。
- `scripts/verify-exhibition.js`：浏览器验收；`verify-ui.js` 是兼容入口。
- `public/editorial.css`：旧设计草案保留，不再由当前入口加载。

第三方资源许可见 `public/vendor/NOTICE.txt` 和 `public/assets/fonts/OFL.txt`。
