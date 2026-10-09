# HIPKOP 沉浸首页独立 QA — 初始审计

日期：2026-10-08。当前运行实例 `http://127.0.0.1:4180`。以下为升级前状态，不代表最终升级结果。

## 已获得的真实证据

- `npm run check` 通过；`npm test` 56/56 通过。这些测试没有覆盖真实音频播放与页面性能。
- `/api/health`：504 位艺人、1154 张作品、1952 首曲目、916 个已缓存封面。数据库包含真实 Apple 试听 URL，具备实际音频验收条件。
- 升级前服务器静态路由只识别 `/`，`/hipkop` 会 404，必须添加路由 alias 后验收。
- 升级前仅存在外部平台跳转和试听片段链接，没有持续 HTMLAudioElement 播放器。
- `rankRow()` 首页默认右栏直接展示编辑评分，今日top10必须单独关闭该 metric。
- `toggleLike()` 修改内存 Set，但专辑详情按钮不重绘 aria-pressed；刷新丢失收藏。曲目收藏重绘时也把原 album 传为 null，可能丢失所属专辑。
- 艺人“关注”旧实现仅 toast，无持久化；本轮应避免把该提示当作功能完成的证据。
- 我的收藏旧实现仅 toast“收藏夹为空”，与已收藏状态矛盾。

## 新浏览器验收脚本

`node scripts/verify-exhibition.js` 对运行实例进行真实 browser 验收，生成 `docs/exhibition-verification/report.json` 和多视口截图。正常流程不 mock 数据、搜索或音频，不伪造 playing 事件。

现阶段舞台契约期望：

- 舞台 `.exhibition-stage` / `.exhibition-hero` / `[data-exhibition]` 三选一。
- 主播放按钮 `[data-stage-play]` / `.stage-play` / `.exhibition-play` 三选一。
- 舞台 `data-playing="true|false"` 由实际音频状态同步。
- `window.HipkopPlayer.audio`、`snapshot()`。

验收范围：`/hipkop`、今日top10无评分、真实 `playing` 事件和 currentTime 增长、pause 同步、收藏重载持久、真实法老搜索/关联艺人、三类榜单所有排序、社区 composer、320/390/1440 五页安全区、GSAP 生命周期、移动/桌面 rAF 与长任务采样、reduced-motion、GSAP 网络故障降级、控制台错误。

## 最终验收（2026-10-08）

当前验证地址：`http://127.0.0.1:4184/hipkop`，同一项目与原 SQLite 目录。
原 4180 服务未关闭；新端口用于加载最新服务端路由与前端资源。

- `npm run build` 通过：全部前端 JS 类型检查、语法检查、生产打包。
- `npm test`：64/64 通过。
- `npm run test:ui`：17/17 通过。报告时间 `2026-10-08T14:57:50.226Z`。
- 真实远端 Apple 试听成功解码，audio currentTime 增长、真实 playing/pause 事件与舞台状态一致。
- 唱片旋转时轴心保持固定；修复了全局 `transform-box:fill-box` 对 SVG 原点的干扰。
- 三类榜单、全部排序、法老搜索、艺人关联、推荐更换、收藏持久化、社区弹层均已实际操作。
- 320 / 390 / 1440px 五页无横向溢出；播放器不覆盖底部导航。
- reduced-motion 和 GSAP 脚本失败模式通过；切页无 ScrollTrigger 累积。
- 正常模式 pageerror / console error / HTTP 失败均为 0。
- 当前设备实际 rAF 样本：390px 滚动 P95 23.1ms，1440px P95 16ms，采样中无 >50ms 帧与长任务。不是所有设备的性能保证。
- 独立检查首页、播放态、榜单截图后，修正了 SVG 噪声滤镜开销、播放器样式契约和旋转轴心，再重新完整验收。
- logo SHA-256 与指定“为小程序设计Logo”对话原文件一致：`27d1a8385a862e6c49ef0484771ac39228b8e7d2b97f77032387d9d90bf4bc0b`。

真实截图与详细报告位于 `docs/exhibition-verification/`，该目录作为本地验收产物被 gitignore。
