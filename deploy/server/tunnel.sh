#!/usr/bin/env bash
# Public HTTPS for HIPKOP. The pod has no public ingress, so reachability comes
# from an outbound Cloudflare tunnel instead of an opened firewall port.
#
# Always restarts the tunnel: a quick tunnel prints a fresh URL per run, so the
# log is rotated first and pkill matches the binary name (no quoting hazards).
# The watchdog only calls this when the tunnel is already down.
set -u
ROOT="${HIPKOP_ROOT:-$HOME/hipkop}"
BIN="$ROOT/bin/cloudflared"
PORT=${1:-4180}
LOG="$ROOT/log/tunnel.log"
mkdir -p "$ROOT/log"

[ -x "$BIN" ] || { echo "missing $BIN" >&2; exit 1; }

if [ -f "$ROOT/log/tunnel.pid" ]; then
  pid=$(cat "$ROOT/log/tunnel.pid")
  if kill -0 "$pid" 2>/dev/null; then
    tr '\0' '\n' < "/proc/$pid/cmdline" | grep -Fx "$BIN" >/dev/null || { echo "Saved PID belongs to another process" >&2; exit 1; }
    kill "$pid"
    sleep 2
  fi
fi
[ -f "$LOG" ] && mv -f "$LOG" "$LOG.1"

setsid nohup "$BIN" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >> "$LOG" 2>&1 < /dev/null &
echo "$!" > "$ROOT/log/tunnel.pid"

for _ in $(seq 1 40); do
  sleep 2
  url=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | tail -1)
  if [ -n "$url" ]; then
    echo "$url" > "$ROOT/log/tunnel.url"
    echo "public url: $url"
    exit 0
  fi
done
echo "no url yet; see $LOG" >&2
exit 1
