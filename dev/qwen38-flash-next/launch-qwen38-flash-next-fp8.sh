#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=/data1/gys/qwen38-flash-next
SCREEN_NAME=qwen38_flash_next_fp8_prod
LOG_FILE="$ROOT/logs/server-fp8-tp8-256k.log"

if screen -list | grep -q "[.]${SCREEN_NAME}[[:space:]]"; then
  echo "$SCREEN_NAME is already running"
  exit 0
fi
if ss -ltn "sport = :23341" | grep -q ':23341'; then
  echo 'port 23341 is already occupied' >&2
  exit 2
fi

mkdir -p "$ROOT/logs"
"$ROOT/scripts/validate-qwen4-tvm-jit-policy.sh" 2>&1 | \
  tee "$ROOT/logs/qwen4-release-gate-13.log"
: > "$LOG_FILE"
screen -dmS "$SCREEN_NAME" bash -lc \
  "exec '$ROOT/scripts/start-qwen38-flash-next-fp8.sh' >>'$LOG_FILE' 2>&1"
echo "started $SCREEN_NAME; log=$LOG_FILE"
