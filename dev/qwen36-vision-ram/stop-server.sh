#!/usr/bin/env bash
set -Eeuo pipefail

PORT="${PORT:-23343}"
SCREEN_NAME="qwen36_vision_${PORT}"
if screen -list | grep -q "[.]${SCREEN_NAME}[[:space:]]"; then
  screen -S "$SCREEN_NAME" -X quit
  printf 'QWEN36_VISION_STOPPED port=%s screen=%s\n' "$PORT" "$SCREEN_NAME"
else
  printf 'Managed screen %s is not running; no process was stopped\n' "$SCREEN_NAME"
fi
