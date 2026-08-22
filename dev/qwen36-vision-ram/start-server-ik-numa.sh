#!/usr/bin/env bash
set -Eeuo pipefail

# DSH-021 Q8 accuracy-first candidate launcher. It defaults to an isolated
# port and must not replace the managed service without explicit authorization.
BIN="${IK_LLAMA_SERVER_BIN:-/data1/gys/dsh021/ik-numa-mirror/build-gcc12/bin/llama-server}"
MODEL="${MODEL:-/dev/shm/gys/qwen36-q8/Qwen3.6-35B-A3B-Q8_0.gguf}"
MMPROJ="${MMPROJ:-/dev/shm/gys/qwen36-q8/mmproj-BF16.gguf}"
ALIAS="${MODEL_ALIAS:-Qwen3.6-35B-A3B}"
PORT="${PORT:-23355}"
CONTEXT_SIZE="${CONTEXT_SIZE:-8192}"
THREADS="${THREADS:-44}"
THREADS_BATCH="${THREADS_BATCH:-96}"
THREADS_MTMD="${THREADS_MTMD:-96}"
BATCH_SIZE="${BATCH_SIZE:-512}"
UBATCH_SIZE="${UBATCH_SIZE:-64}"

for path in "$BIN" "$MODEL" "$MMPROJ"; do
  [[ -f "$path" ]] || { printf 'Missing required file: %s\n' "$path" >&2; exit 1; }
done
[[ "$PORT" =~ ^[0-9]+$ ]] || { printf 'PORT must be numeric\n' >&2; exit 2; }
if [[ "$PORT" == 23343 && "${ALLOW_PRODUCTION_PORT:-0}" != 1 ]]; then
  printf 'Refusing production port 23343 without ALLOW_PRODUCTION_PORT=1\n' >&2
  exit 2
fi

# --numa-mirror weights forces no-mmap and creates one system-RAM weight copy
# per NUMA node. The projector and all model layers remain off the GPUs.
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
  --batch-size "$BATCH_SIZE" \
  --ubatch-size "$UBATCH_SIZE" \
  --threads "$THREADS" \
  --threads-batch "$THREADS_BATCH" \
  --threads-mtmd "$THREADS_MTMD" \
  --numa-mirror weights \
  --n-gpu-layers 0 \
  --no-mmproj-offload \
  --flash-attn on \
  --cache-type-k q8_0 \
  --cache-type-v q8_0 \
  --run-time-repack \
  --no-cont-batching \
  --metrics \
  --jinja
