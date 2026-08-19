#!/usr/bin/env bash
set -euo pipefail

ROOT=/data1/gys/deepseek-v4
TARGET="${1:-}"
LOCK_FILE="$ROOT/state/model-switch.lock"

case "$TARGET" in
  Qwen3.8-27B-FP8|DeepSeek-V4-Flash-0731-Q4_K_XL|DeepSeek-V4-Flash-0731-Q8_K_XL) ;;
  *) echo "unsupported model target: $TARGET" >&2; exit 2 ;;
esac

mkdir -p "$ROOT/state"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "another model switch is already running" >&2; exit 75; }

stop_screen() {
  local name="$1"
  if screen -list | grep -q "[.]${name}[[:space:]]"; then
    screen -S "$name" -X quit
    echo "stopped $name"
  fi
}

for screen_name in \
  deepseek_v4_q4_dspark \
  deepseek_v4_q8_dspark \
  deepseek_v4_server \
  qwen38_sglang_prod \
  qwen38_sglang_nextn; do
  stop_screen "$screen_name"
done

for _ in $(seq 1 60); do
  if ! ss -ltn "sport = :23341" | grep -q ':23341'; then
    break
  fi
  sleep 1
done
if ss -ltn "sport = :23341" | grep -q ':23341'; then
  echo "port 23341 is still occupied after stopping known model screens" >&2
  exit 1
fi

case "$TARGET" in
  Qwen3.8-27B-FP8)
    /data1/gys/qwen38/scripts/launch_qwen38_sglang_production.sh
    /data1/gys/qwen38/scripts/launch_qwen38_sglang_long_context.sh
    ;;
  DeepSeek-V4-Flash-0731-Q4_K_XL)
    MODEL_VARIANT=UD-Q4_K_XL "$ROOT/scripts/launch-server.sh"
    ;;
  DeepSeek-V4-Flash-0731-Q8_K_XL)
    MODEL_VARIANT=UD-Q8_K_XL "$ROOT/scripts/launch-server.sh"
    ;;
esac

echo "launch requested for $TARGET"
