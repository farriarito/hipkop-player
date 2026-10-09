#!/usr/bin/env bash
# One supervisor loop instead of cron: this pod has no crond, and the loop also
# survives my SSH session thanks to setsid. It keeps both the app and the tunnel
# alive and records the current public URL.
set -u
ROOT="${HIPKOP_ROOT:-$HOME/hipkop}"
mkdir -p "$ROOT/log"
echo "watchdog start $(date -Is)"
while true; do
  if ! pgrep -f "$ROOT/app/server.js" > /dev/null; then
    echo "watchdog: app down $(date -Is)"
    bash "$ROOT/bin/start.sh" >> "$ROOT/log/watchdog.log" 2>&1
  fi
  if ! pgrep -f "cloudflared tunnel --url" > /dev/null; then
    echo "watchdog: tunnel down $(date -Is)"
    bash "$ROOT/bin/tunnel.sh" >> "$ROOT/log/watchdog.log" 2>&1
  fi
  sleep 60
done