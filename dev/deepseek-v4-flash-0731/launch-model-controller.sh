#!/usr/bin/env bash
set -euo pipefail

ROOT=/data1/gys/deepseek-v4
SCREEN_NAME=deepseek_v4_model_control
ENV_FILE="$ROOT/control/model-controller.env"
LOG_FILE="$ROOT/logs/model-controller.log"

[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE" >&2; exit 1; }
if screen -list | grep -q "[.]${SCREEN_NAME}[[:space:]]"; then
  echo "$SCREEN_NAME is already running"
  exit 0
fi

mkdir -p "$ROOT/logs" "$ROOT/state"
touch "$LOG_FILE"
chmod 600 "$ENV_FILE"
screen -dmS "$SCREEN_NAME" bash -lc \
  "set -a; source '$ENV_FILE'; set +a; exec '$ROOT/env/bin/python' '$ROOT/control/model-controller.py' >>'$LOG_FILE' 2>&1"
echo "started $SCREEN_NAME; log=$LOG_FILE"
