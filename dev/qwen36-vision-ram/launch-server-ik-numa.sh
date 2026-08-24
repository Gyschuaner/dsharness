#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-23343}"
SCREEN_NAME="qwen36_vision_${PORT}"
LOG_ROOT="${LOG_ROOT:-/data1/gys/qwen36-vision/logs}"
LOG_FILE="$LOG_ROOT/server-ik-numa-$PORT.log"

"$SCRIPT_DIR/stage-model.sh"
if ss -ltn "sport = :$PORT" | grep -q ":$PORT"; then
  printf 'Port %s is already in use; refusing to replace an unknown process\n' "$PORT" >&2
  exit 1
fi
if screen -list | grep -q "[.]${SCREEN_NAME}[[:space:]]"; then
  printf 'Screen %s already exists\n' "$SCREEN_NAME" >&2
  exit 1
fi

mkdir -p "$LOG_ROOT"
screen -dmS "$SCREEN_NAME" bash -lc \
  "exec env ALLOW_PRODUCTION_PORT=1 PORT='$PORT' '$SCRIPT_DIR/start-server-ik-numa.sh' >>'$LOG_FILE' 2>&1"

for _ in $(seq 1 360); do
  if curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && \
     curl -fsS --max-time 3 "http://127.0.0.1:$PORT/v1/models" | grep -Fq '"id":"Qwen3.6-35B-A3B"'; then
    printf 'QWEN36_VISION_IK_NUMA_STARTED port=%s screen=%s log=%s\n' \
      "$PORT" "$SCREEN_NAME" "$LOG_FILE"
    exit 0
  fi
  if ! screen -list | grep -q "[.]${SCREEN_NAME}[[:space:]]"; then
    tail -n 80 "$LOG_FILE" >&2 || true
    printf 'IK NUMA vision server exited before becoming healthy\n' >&2
    exit 1
  fi
  sleep 2
done

tail -n 80 "$LOG_FILE" >&2 || true
printf 'IK NUMA vision server did not become healthy within 720 seconds\n' >&2
exit 1
