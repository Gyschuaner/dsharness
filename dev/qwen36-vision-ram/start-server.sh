#!/usr/bin/env bash
set -Eeuo pipefail

BIN="${LLAMA_SERVER_BIN:-/data1/gys/deepseek-v4/experiments/builds/llama-main-sm89/bin/llama-server}"
RAM_ROOT="${RAM_ROOT:-/dev/shm/gys/qwen36-q8}"
MODEL="${MODEL:-$RAM_ROOT/Qwen3.6-35B-A3B-Q8_0.gguf}"
MMPROJ="${MMPROJ:-$RAM_ROOT/mmproj-BF16.gguf}"
ALIAS="${MODEL_ALIAS:-Qwen3.6-35B-A3B}"
PORT="${PORT:-23343}"
CONTEXT_SIZE="${CONTEXT_SIZE:-32768}"
THREADS="${THREADS:-48}"
THREADS_BATCH="${THREADS_BATCH:-96}"

for path in "$BIN" "$MODEL" "$MMPROJ"; do
  [[ -f "$path" ]] || { printf 'Missing required file: %s\n' "$path" >&2; exit 1; }
done
[[ "$MODEL" == /dev/shm/* && "$MMPROJ" == /dev/shm/* ]] || {
  printf 'The production vision model and mmproj must both be staged in /dev/shm\n' >&2
  exit 2
}
[[ "$PORT" =~ ^[0-9]+$ ]] || { printf 'PORT must be numeric\n' >&2; exit 2; }

# Keep the vision layer in CPU/system RAM and protect the main model's VRAM.
export CUDA_VISIBLE_DEVICES=""
export OMP_NUM_THREADS="$THREADS_BATCH"

exec "$BIN" \
  --model "$MODEL" \
  --mmproj "$MMPROJ" \
  --alias "$ALIAS" \
  --host 127.0.0.1 \
  --port "$PORT" \
  --ctx-size "$CONTEXT_SIZE" \
  --parallel 1 \
  --batch-size 2048 \
  --ubatch-size 512 \
  --threads "$THREADS" \
  --threads-batch "$THREADS_BATCH" \
  --numa distribute \
  --n-gpu-layers 0 \
  --no-mmproj-offload \
  --flash-attn on \
  --cache-type-k q8_0 \
  --cache-type-v q8_0 \
  --metrics \
  --slots \
  --jinja \
  --offline
