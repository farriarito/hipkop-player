#!/usr/bin/env bash
# stop.sh [app|tunnel|all]   (default: app)
ROOT="${HIPKOP_ROOT:-$HOME/hipkop}"
what="${1:-app}"
case "$what" in
  app|all)    pkill -f "$ROOT/app/server.js" && echo "app stopped" || echo "app was not running" ;;
esac
case "$what" in
  tunnel|all) pkill -f "cloudflared tunnel --url" && echo "tunnel stopped" || echo "tunnel was not running" ;;
esac