#!/usr/bin/env bash
# stop.sh [app|tunnel|all]   (default: app)
set -eu
ROOT="${HIPKOP_ROOT:-$HOME/hipkop}"
what="${1:-app}"
stop_one() {
  local kind="$1" expected="$2" file="$ROOT/log/$1.pid" pid
  [ -f "$file" ] || return 0
  pid=$(cat "$file")
  case "$pid" in ''|*[!0-9]*) echo "invalid pid file" >&2; return 1 ;; esac
  if kill -0 "$pid" 2>/dev/null; then
    tr '\0' '\n' < "/proc/$pid/cmdline" | grep -Fx "$expected" >/dev/null || { echo "PID belongs to a different process" >&2; return 1; }
    kill "$pid"
  fi
  rm -f "$file"
  echo "$kind stopped"
}
case "$what" in
  app) stop_one app "$ROOT/app/server.js" ;;
  tunnel) stop_one tunnel "$ROOT/bin/cloudflared" ;;
  all) stop_one app "$ROOT/app/server.js"; stop_one tunnel "$ROOT/bin/cloudflared" ;;
  *) echo "Usage: stop.sh app|tunnel|all" >&2; exit 1 ;;
esac
