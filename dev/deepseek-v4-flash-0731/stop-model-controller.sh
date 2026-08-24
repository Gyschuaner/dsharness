#!/usr/bin/env bash
set -euo pipefail

SCREEN_NAME=deepseek_v4_model_control
if screen -list | grep -q "[.]${SCREEN_NAME}[[:space:]]"; then
  screen -S "$SCREEN_NAME" -X quit
  echo "stopped $SCREEN_NAME"
else
  echo "$SCREEN_NAME is not running"
fi
