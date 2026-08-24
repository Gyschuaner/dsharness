#!/usr/bin/env bash
set -Eeuo pipefail

PORT="${PORT:-23343}"
SCREEN_NAME="qwen36_vision_${PORT}"
screen -list | grep -E "[.]${SCREEN_NAME}[[:space:]]" || true
curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health"
printf '\n'
curl -fsS --max-time 3 "http://127.0.0.1:$PORT/v1/models"
printf '\n'
curl -fsS --max-time 3 "http://127.0.0.1:$PORT/metrics" | \
  grep -E '^(llamacpp:prompt_tokens_total|llamacpp:tokens_predicted_total|llamacpp:requests_processing|llamacpp:requests_deferred)' || true
