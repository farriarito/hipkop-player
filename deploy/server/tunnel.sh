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

pkill -x cloudflared 2>/dev/null && sleep 2
[ -f "$LOG" ] && mv -f "$LOG" "$LOG.1"

setsid nohup "$BIN" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >> "$LOG" 2>&1 < /dev/null &

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