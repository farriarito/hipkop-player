# HIPKOP / 四间声场

2026-10-09。直接升级当前 `/hipkop` 应用，不创建另一个 Demo。

## 项目确认

- 正确工作区：`C:\Users\lenovo\Documents\Codex\2026-10-03\https-github-com-wux1an-wxapkg-https\outputs\hipkop-player`。
- 当前地址：`http://127.0.0.1:4185/hipkop`。
- 已比较服务返回的 `/app.js` 与工作区源文件，内容相同。
- 技术栈：原生 JavaScript SPA、Node HTTP、SQLite、GSAP + ScrollTrigger、本地 SVG 和 Outfit 字体。五个 tab 由原有 `navigate / paint` 控制。
- 音乐信息、封面、分类和社区沿用实际 `/api` 与 `/media` 服务；未替换成预写搜索结果。

## 四页交付

| 页面 | 本轮变化 | 保留与增强的真实行为 |
| --- | --- | --- |
| 首页 | 品牌恢复 HIPKOP；唱片中心使用既有耳机＋H Logo；桌面展开为最大 1200px 双区展厅 | 原有新作、推荐、私人雷达、今日top10、社区入口；播放信息与当前音频同步 |
| 榜单 | 三张真实封面构成唱片展台；第四名起为清楚的行列表；筛选区随滚动保持可访问 | 三类榜单、三种排序、直接试听/暂停、收藏、详情；顺序与实际 API 完全相同 |
| 发现 | 两个来自真实分类目录的探索入口；大封面专辑与紧凑带封面单曲交替 | 一个搜索框、Enter 提交、实际搜索与艺人关系；原位风格/年份/排序筛选、启用反馈、一键清除；不会销毁搜索框 |
| 社区 | 编辑作者的真实来信与时间线留言墙；作者/话题/时间/赞数明确对应；低数据空状态 | 现有六类话题、原位切换、展开正文、发帖；可选署名与关联现有专辑；音乐附件可试听、进入详情 |

没有历史周期快照、涨跌历史或评论 API，就不伪造日/周/月榜、趋势箭头或评论数量。榜单周期当前只支持「当前快照」，其余明确禁用。同步时间注明为「目录同步」；评分排序称「目录编辑分」，不冒充用户评分。

移除原先硬编码的虚构离线曲目/作者/统计和热度合成函数；服务不可用时展示实际空状态或错误，不悄悄改成示例内容。

## 音画同步

- `player.js` 继续持有一个全站持续的 HTMLAudioElement；实际 `playing / pause / error / timeupdate` 发布 `hipkop:player`。
- `exhibition.js` 读取该状态同步主按钮、歌曲标题、艺人、封面与播放进度。进度不冒充振幅分析。
- `motion.js` 只在真实播放、舞台在屏幕内、页面可见、用户允许动画时旋转黑胶；暂停即停止。
- 榜单唱片播放态使用有限的空间旋入与选中色，状态同样来自真实播放器。
- 继续采用层叠 SVG、CSS perspective 和 GSAP，未增加 Three.js、WebGL、Blender 或部署时外部渲染要求。
- 石质主体、红色织物、刻度、碎片与旋转黑胶拆成独立 HTML 合成图层；SVG 只负责各图层的材质，持续旋转不再重绘整个石质场景。每层的渐变与裁剪 ID 独立，唱片轴心在窗口调整后保持稳定。
- 减弱动态效果和 GSAP 加载失败都保留业务操作；切页清理动效上下文、观察器和事件。
- 修复艺人页打开作品后被带回旧滚动位置的问题：详情渲染后重置视口、禁止旧内容滚动锚定，并清理／同步 ScrollTrigger 的滚动缓存。网络与调用栈诊断确认旧偏移来自刷新时的缓存恢复，回归仍严格断言详情页 `scrollY === 0`。

## `/undefined` 资源排查

当前内置浏览器错误日志为空；无扩展的 Chromium 四页回归同时记录网络 initiator 和响应状态。本轮未复现历史 `/undefined`，所以不将该历史错误武断归因于浏览器扩展。

排查发现三个需要收紧的应用边界：封面/头像 `src`、艺人 `background-image`、播放器封面此前接受未经验证的 Provider URL。字符串 `"undefined"` 会在这些位置被浏览器当成相对路径。

现在由 `culture.js` 的 `resource()` 统一拒绝空值、`undefined/null`、这些路径段及不支持的 URL 协议；回退资源也需验证。缺失作品 ID 不再进入详情请求。对真实艺人响应进行「URL 字段缺失/无效」故障注入验证不会请求 `/undefined`，没有通过服务器返回假的 200 隐藏问题。

## 文件职责

- `public/index.html`：HIPKOP 产品名、资源版本、四页主题入口。
- `public/culture.js`：共享媒体 URL 边界、唱片展台、发现入口、音乐操作、社区墙、播放态同步。
- `public/culture.css`：四页新布局、桌面展开、触控/焦点反馈。
- `public/app.js`：页面与已有真实 API 集成、局部更新、并发请求保护、筛选清除、可选发帖关联作品。
- `public/exhibition-art.js`：中心复用原版 Logo、将 SVG 材质拆为独立合成图层。
- `public/exhibition.js`：主舞台当前试听信息与真实进度。
- `public/player.js`：封面资源守卫，仍使用原有持续播放器。
- `public/motion.js`：展台/留言墙入场与局部结果切换、播放态旋转和滚动缓存生命周期。
- `public/types.d.ts`：新组件接口。
- `tests/culture.test.js`、`tests/frontend-design.test.js`：媒体边界、品牌和真实数据呈现契约。
- `scripts/verify-culture.js`：四页端到端验收、实际音频、API 排序、搜索/筛选/收藏/社区、响应式与性能；发帖在真实目录的独立 SQLite 副本完成，不污染正式社区。
- `scripts/verify-exhibition.js`：更新先前验收的品牌、桌面宽度和前三名契约。

## 复验

```powershell
npm test
npm run build
Remove-Item Env:HIPKOP_CULTURE_ONLY -ErrorAction SilentlyContinue
$env:HIPKOP_UI_URL='http://127.0.0.1:4185'
npm run test:culture
npm run test:ui
```

本地结果见 `docs/culture-verification/report.json`、`docs/exhibition-verification/report.json`；截图保存在对应目录。它们是本地验收产物，不提交数据库和用户社区内容。

### 本次最终验证（2026-10-09）

| 检查 | 结果 |
| --- | --- |
| `npm test` | 71/71，通过 |
| `npm run build` | 语法检查、`tsc --noEmit` 和生产构建通过 |
| `npm run test:culture` | 16/16，通过 |
| `npm run test:ui` | 23/23，通过，包含艺人→作品详情严格顶部回归 |
| `git diff --check` | 通过；只有 Git 的 Windows 换行提示 |
| 正常浏览器运行 | 页面异常、控制台错误、HTTP 失败与 `/undefined` 请求均为 0 |
| 布局 | 四页均检查 320、390、768、1024、1440px；无意外横向滚动，末尾操作不被播放器／导航遮挡 |
| 降级 | reduced-motion、无 WebGL、GSAP 加载失败及失效图片／音频均通过 |

移动与桌面实际播放＋滚动采样 P95 约 7.1ms；这是本机验收结果，不是对所有手机性能的承诺。报告分别保存视口宽度和应用宽度，桌面精确核对 32px 外边距与 1200px 展厅上限，避免把 1024px 下正常的 960px 布局误判为未展开。

验收读取原有 SQLite 目录（511 艺人、1154 作品、2021 单曲）；发帖测试在该目录的一致性副本中验证真实 POST 与持久化，正式社区的 4 条原帖不变。无试听资源时明确提示并保留来源平台入口，未以假音频代替实际播放。
