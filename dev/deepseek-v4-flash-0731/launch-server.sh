#!/usr/bin/env bash
set -euo pipefail

ROOT=/data1/gys/deepseek-v4
VARIANT="${MODEL_VARIANT:-UD-Q4_K_XL}"
SCREEN_NAME=deepseek_v4_server
LOG_FILE="$ROOT/logs/server-${VARIANT}.log"

if screen -list | grep -q "[.]${SCREEN_NAME}[[:space:]]"; then
  echo "$SCREEN_NAME is already running"
  exit 0
fi

mkdir -p "$ROOT/logs"
: > "$LOG_FILE"
screen -dmS "$SCREEN_NAME" bash -lc \
  "MODEL_VARIANT='$VARIANT' exec $ROOT/scripts/start-server.sh >>'$LOG_FILE' 2>&1"
echo "started $SCREEN_NAME variant=$VARIANT log=$LOG_FILE"
