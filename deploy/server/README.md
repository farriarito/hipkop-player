# 用户态服务器部署（无 sudo / 无 Docker / 只有 sshd 端口）

> 2026-10-09 加固后注意：此目录由协作者提交并保留，但没有在本次会话操作或验证所述远程主机。
> 下文的 NFS home 不能直接承担 SQLite WAL 生产库；`start.sh` 现在会拒绝 NFS/CIFS。
> 需先由主机管理员提供持久本地盘／块存储，并确认端口与真实域名。
> 启动强制 `NODE_ENV=production`，发帖需账号＋CSRF＋人工审核，管理 token 至少 32 字符。
> 使用本项目一致性迁移脚本传私有数据；不要照搬旧说明里的实时 db/WAL/SHM 裸复制。
> 随机隧道 URL 更新后必须修改 `.env` 的 `HIPKOP_PUBLIC_ORIGIN` 并重启 app，确保同源校验与当前入口一致。

这是 `docs/DEPLOY.md` 路径 D 的可执行版本，跑在 **yangjinhao-2**（k8s pod，NFS home 16TB，
自带 Node 24）上。适用场景是：能 SSH 进去，但没有 root、没有 docker 组权限、
防火墙只放开 sshd 端口，因此公网入口只能靠**出网隧道**。

## 目录布局（服务器上）

```
~/hipkop/
  app/        dist 产物（server.js + public + src），.env 也放这里
  bin/        start.sh stop.sh tunnel.sh watchdog.sh cloudflared
  data/       hipkop.sqlite + media/（封面缓存）
  log/        app.log tunnel.log watchdog.log tunnel.url
```

## 首次安装

```bash
# 本机：构建产物并上传（dist 约 0.5 MB）
npm run build
tar -czf /tmp/hipkop-dist.tar.gz -C . dist
ssh SERVER 'mkdir -p ~/hipkop/{app,bin,data,log}'
scp /tmp/hipkop-dist.tar.gz SERVER:~/hipkop/
scp deploy/server/*.sh SERVER:~/hipkop/bin/
ssh SERVER 'cd ~/hipkop/app && tar -xzf ../hipkop-dist.tar.gz --strip-components=1'

# 服务器：写 .env（端口、路径、密钥、令牌）
#   HIPKOP_PLAYER_HOST=127.0.0.1     ← 没有公网入口，绑本地即可
#   HIPKOP_PLAYER_PORT=4180
#   HIPKOP_DB_PATH=$HOME/hipkop/data/hipkop.sqlite
#   HIPKOP_MEDIA_DIR=$HOME/hipkop/data/media
#   HIPKOP_ADMIN_TOKEN=...           ← 公网必须设，否则 /api/sync/* 敞开
#   DEEPSEEK_API_KEY=...             ← 可选
# 若想带上本地已灌好的目录，再把 data/hipkop.sqlite{,-wal,-shm} 传上去

bash ~/hipkop/bin/start.sh      # 起来并自检 /api/health
bash ~/hipkop/bin/tunnel.sh     # 打印 https://<随机>.trycloudflare.com
bash ~/hipkop/bin/watchdog.sh & # 每分钟巡检，app 或隧道掉了自动拉起
```

## 升级

```bash
npm run build && tar -czf /tmp/d.tgz -C . dist
scp /tmp/d.tgz SERVER:~/hipkop/
ssh SERVER 'rm -rf ~/hipkop/app/{public,src,server.js,package.json,README.txt} \
  && cd ~/hipkop/app && tar -xzf ../d.tgz --strip-components=1 \
  && bash ~/hipkop/bin/stop.sh app && bash ~/hipkop/bin/start.sh'
```

`start.sh` 是幂等的：进程已经在跑就只做健康检查，不会重启，所以升级后必须显式
`stop.sh app`（或者 `stop.sh all`，但那会一起停隧道并换一个新地址）。

## 坑

- **Ubuntu 18.04 / glibc 2.27 跑不了 Node 22+ 官方包**（要求 glibc 2.28，
  报 `version 'GLIBC_2.28' not found`）。要么用 musl 静态包
  `unofficial-builds.nodejs.org/.../node-vX-linux-x64-musl.tar.xz`，要么换台机器。
  paper1316/1318 就是 glibc 2.27，且 gcc 只有 7.5（编不了 Node 24），所以先放在这台上。
- 这些机器**没有 crond / systemd**，所以用 `watchdog.sh` 循环兜底，`@reboot` 那套用不上；
  pod 重建后需要手工再跑一次 `watchdog.sh`。
- `pkill -f` 的匹配串里带空格，经 SSH + PowerShell 传参时引号会被吃掉，
  所以脚本内部一律用 `pkill -x cloudflared` 这类无空格匹配。
- 隧道地址每次重启都会变。要固定域名就换成 Cloudflare 具名隧道（需账号）或
  让管理员在防火墙上放行一个端口。
