#!/usr/bin/env bash
set -Eeuo pipefail

SCREEN_NAME=qwen38_flash_next_fp8_prod
if screen -list | grep -q "[.]${SCREEN_NAME}[[:space:]]"; then
  screen -S "$SCREEN_NAME" -X quit
  echo "stopped $SCREEN_NAME"
else
  echo "$SCREEN_NAME is not running"
fi
