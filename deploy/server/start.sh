#!/usr/bin/env bash
# HIPKOP on yangjinhao-2: user-space Node (already on the box), the prebuilt dist
# bundle, and a SQLite catalog on the persistent NFS home. Idempotent — this is
# also the watchdog target, so it must be safe to run while the app is healthy.
set -u
ROOT="${HIPKOP_ROOT:-$HOME/hipkop}"
APP="$ROOT/app"
LOG="$ROOT/log/app.log"

mkdir -p "$ROOT/data/media" "$ROOT/log"
command -v node > /dev/null || { echo "node missing" >&2; exit 1; }
[ -f "$APP/server.js" ] || { echo "missing $APP/server.js" >&2; exit 1; }

if pgrep -f "$APP/server.js" > /dev/null; then
  echo "hipkop already running (pid $(pgrep -f "$APP/server.js" | head -1))"
else
  cd "$APP" || exit 1
  setsid nohup node --env-file-if-exists="$APP/.env" "$APP/server.js" >> "$LOG" 2>&1 < /dev/null &
  sleep 4
fi

PORT=$(grep -E '^HIPKOP_PLAYER_PORT=' "$APP/.env" | cut -d= -f2)
PORT=${PORT:-4180}
if curl -sf -m 8 "http://127.0.0.1:$PORT/api/health" > /dev/null; then
  echo "hipkop healthy on 127.0.0.1:$PORT"
else
  echo "hipkop not answering on $PORT" >&2
  tail -30 "$LOG" >&2
  exit 1
fi