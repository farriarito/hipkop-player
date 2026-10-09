#!/usr/bin/env bash
# Public HTTPS for HIPKOP. The pod has no public ingress, so reachability comes
# from an outbound Cloudflare tunnel instead of an opened firewall port.
#
# Idempotent by design. A quick tunnel keeps its hostname for the whole lifetime
# of the process and mints a fresh one on every restart, so a healthy tunnel is
# left exactly as it is. Restarting unconditionally looked harmless but was not:
# two supervisors racing here would each replace the other's tunnel, and the URL
# handed to a visitor kept changing under them.
#
# Called by the watchdog (which may have more than one instance), so this must
# stay safe to run at any time.
set -u
ROOT="${HIPKOP_ROOT:-$HOME/hipkop}"
BIN="$ROOT/bin/cloudflared"
PORT=${1:-4180}
LOG="$ROOT/log/tunnel.log"
URLFILE="$ROOT/log/tunnel.url"
PIDFILE="$ROOT/log/tunnel.pid"
mkdir -p "$ROOT/log"

[ -x "$BIN" ] || { echo "missing $BIN" >&2; exit 1; }

alive() {
  [ -f "$PIDFILE" ] || return 1
  local pid
  pid=$(cat "$PIDFILE" 2>/dev/null) || return 1
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  # Never trust a recycled PID: it has to be our own binary.
  tr '\0' '\n' < "/proc/$pid/cmdline" 2>/dev/null | grep -Fx "$BIN" > /dev/null || return 1
  return 0
}

# Healthy means: our process is up AND the public URL still answers through it.
current=$(cat "$URLFILE" 2>/dev/null || true)
if [ -n "$current" ] && alive && curl -sf -m 8 "$current/api/health" > /dev/null 2>&1; then
  echo "public url: $current (unchanged)"
  exit 0
fi

# Anything else is a tunnel worth replacing - including the case where the
# process is up but Cloudflare has already retired the hostname.
if alive; then
  kill "$(cat "$PIDFILE")" 2>/dev/null
  sleep 2
fi
pkill -x cloudflared 2>/dev/null && sleep 2
[ -f "$LOG" ] && mv -f "$LOG" "$LOG.1"

setsid nohup "$BIN" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >> "$LOG" 2>&1 < /dev/null &
echo "$!" > "$PIDFILE"

for _ in $(seq 1 40); do
  sleep 2
  url=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | tail -1)
  if [ -n "$url" ]; then
    echo "$url" > "$URLFILE"
    echo "public url: $url"
    exit 0
  fi
done
echo "no url yet; see $LOG" >&2
exit 1