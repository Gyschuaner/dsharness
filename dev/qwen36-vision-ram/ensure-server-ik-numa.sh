#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-23343}"
EXPECTED_BIN="${IK_LLAMA_SERVER_BIN:-/data1/gys/dsh021/ik-numa-mirror/build-gcc12/bin/llama-server}"

listener_pid="$(ss -ltnp "sport = :$PORT" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "$listener_pid" ]]; then
  actual_bin="$(readlink -f "/proc/$listener_pid/exe" 2>/dev/null || true)"
  if [[ "$actual_bin" != "$EXPECTED_BIN" ]]; then
    printf 'Port %s is healthy or occupied by unexpected binary %s; refusing automatic replacement\n' \
      "$PORT" "${actual_bin:-unknown}" >&2
    exit 1
  fi
  if curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && \
     curl -fsS --max-time 3 "http://127.0.0.1:$PORT/v1/models" | grep -Fq '"id":"Qwen3.6-35B-A3B"'; then
    printf 'QWEN36_VISION_IK_NUMA_ALREADY_READY port=%s pid=%s\n' "$PORT" "$listener_pid"
    exit 0
  fi
  printf 'Expected IK NUMA process owns port %s but is not healthy; refusing duplicate launch\n' "$PORT" >&2
  exit 1
fi

exec env PORT="$PORT" "$SCRIPT_DIR/launch-server-ik-numa.sh"
