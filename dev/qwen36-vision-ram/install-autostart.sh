#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_ROOT="${STATE_ROOT:-/data1/gys/qwen36-vision/logs}"
mkdir -p "$STATE_ROOT"
cron_line="@reboot $SCRIPT_DIR/ensure-server.sh >>$STATE_ROOT/autostart.log 2>&1"
current_cron="$(crontab -l 2>/dev/null || true)"
if ! grep -Fqx "$cron_line" <<<"$current_cron"; then
  { printf '%s\n' "$current_cron"; printf '%s\n' "$cron_line"; } | \
    sed '/^$/d' | crontab -
fi
crontab -l | grep -Fqx "$cron_line"
printf 'QWEN36_VISION_AUTOSTART_INSTALLED command=%s\n' "$SCRIPT_DIR/ensure-server.sh"
