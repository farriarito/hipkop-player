#!/usr/bin/env bash
# HIPKOP on yangjinhao-2: user-space Node (already on the box), the prebuilt dist
# bundle, and a SQLite catalog on the persistent NFS home. Idempotent — this is
# also the watchdog target, so it must be safe to run while the app is healthy.
set -eu
ROOT="${HIPKOP_ROOT:-$HOME/hipkop}"
APP="$ROOT/app"
LOG="$ROOT/log/app.log"

mkdir -p "$ROOT/data/media" "$ROOT/log"
command -v node > /dev/null || { echo "node missing" >&2; exit 1; }
[ -f "$APP/server.js" ] || { echo "missing $APP/server.js" >&2; exit 1; }
[ -f "$APP/.env" ] || { echo "production .env missing" >&2; exit 1; }
# Refuse the older shared-NFS layout. WAL requires suitable local persistent
# storage; neither an ephemeral pod filesystem nor NFS is a migration target.
command -v findmnt >/dev/null || { echo "findmnt needed to validate storage" >&2; exit 1; }
export NODE_ENV=production
DB=$(node --env-file="$APP/.env" -e "process.stdout.write(require('$APP/src/config').dbPath)")
FSTYPE=$(findmnt -n -o FSTYPE -T "$(dirname "$DB")")
case "$FSTYPE" in
  nfs*|cifs|smb*) echo "Refusing SQLite WAL on shared $FSTYPE; provision persistent local/block storage" >&2; exit 1 ;;
esac

PIDFILE="$ROOT/log/app.pid"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null &&
  tr '\0' '\n' < "/proc/$(cat "$PIDFILE")/cmdline" | grep -Fx "$APP/server.js" >/dev/null; then
  echo "hipkop already running"
else
  cd "$APP" || exit 1
  setsid nohup node --env-file-if-exists="$APP/.env" "$APP/server.js" >> "$LOG" 2>&1 < /dev/null &
  echo "$!" > "$PIDFILE"
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
