#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-23343}"
if curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && \
   curl -fsS --max-time 3 "http://127.0.0.1:$PORT/v1/models" | \
     grep -Fq '"id":"Qwen3.6-35B-A3B"'; then
  printf 'QWEN36_VISION_ALREADY_READY port=%s\n' "$PORT"
  exit 0
fi
exec env PORT="$PORT" "$SCRIPT_DIR/launch-server.sh"
