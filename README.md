# HIPKOP PLAYER

HIPKOP PLAYER 是面向全球 HipHop/Rap + K-POP 的本地网页 MVP，面向 **全球 HipHop/Rap + K-POP** 听众。它保留五 tab 信息架构、专辑评分/评论、榜单、发现专题、社区和个人收藏路径，同时把内容范围从中文说唱扩展到全球说唱与 K-POP。

## 已实现

- 竖屏手机壳：首页 / 榜单 / 发现 / 社区 / 我的
- 首页：编辑推荐、热评榜、Rap × K-POP hero
- 搜索：按专辑、艺人、流派搜索，支持 `aespa`、`法老`、`A$AP Rocky`、`Higher Brothers` 等演示资料
- 专辑详情：封面、评分、编辑短评、收藏状态
- 发现：使用本地 feature 视觉资源（不执行小程序代码）
- 榜单：综合 Rap + K-POP 排名展示
- 本地演示数据，不连接微信云函数、不使用登录态

## 启动

```powershell
cd C:\Users\lenovo\Documents\Codex\2026-10-03\https-github-com-wux1an-wxapkg-https\outputs\hipkop-player
npm start
```

打开 `http://127.0.0.1:4180/`。如端口冲突：

```powershell
$env:HIPKOP_PLAYER_PORT=4181
npm start
```

## 复刻边界

本项目采用竖屏音乐产品的信息架构与本地静态视觉资源；没有复制微信运行时、云函数、账号数据或第三方专辑音频。下一阶段可以把 `albums`、`posts` 替换为自有 MusicProvider（QQ、Spotify、YouTube Music 等）和统一元数据模型。


