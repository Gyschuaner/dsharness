#!/usr/bin/env bash
set -euo pipefail

ROOT=/data1/gys/deepseek-v4
source "$ROOT/scripts/select-nvidia-driver-libs.sh"
VARIANT="${MODEL_VARIANT:-UD-Q4_K_XL}"
case "$VARIANT" in
  UD-Q4_K_XL) ALIAS=DeepSeek-V4-Flash-0731-Q4_K_XL ;;
  UD-Q8_K_XL) ALIAS=DeepSeek-V4-Flash-0731-Q8_K_XL ;;
  *) echo "unsupported MODEL_VARIANT: $VARIANT" >&2; exit 2 ;;
esac

MODEL_ROOT="/data1/gys/models/DeepSeek-V4-Flash-0731-$VARIANT"
BIN="$ROOT/src/llama.cpp/build-cuda121-sm89-isolated/bin/llama-server"
MODEL="$MODEL_ROOT/$VARIANT/DeepSeek-V4-Flash-0731-$VARIANT-00001-of-00005.gguf"
DRAFT="$MODEL_ROOT/dspark-DeepSeek-V4-Flash-0731-Q8_0.gguf"

PORT="${PORT:-23341}"
CONTEXT_SIZE="${CONTEXT_SIZE:-262144}"
PARALLEL="${PARALLEL:-1}"
BATCH_SIZE="${BATCH_SIZE:-2048}"
UBATCH_SIZE="${UBATCH_SIZE:-512}"
CACHE_K="${CACHE_K:-q8_0}"
CACHE_V="${CACHE_V:-q8_0}"
DRAFT_CACHE_K="${DRAFT_CACHE_K:-q4_0}"
DRAFT_CACHE_V="${DRAFT_CACHE_V:-q4_0}"
ENABLE_DSPARK="${ENABLE_DSPARK:-1}"
DSPARK_N_MAX="${DSPARK_N_MAX:-3}"
DISABLE_CUDA_GRAPHS="${DISABLE_CUDA_GRAPHS:-1}"

for path in "$BIN" "$MODEL"; do
  [[ -f "$path" ]] || { echo "missing required file: $path" >&2; exit 1; }
done
if [[ "$ENABLE_DSPARK" == 1 ]]; then
  [[ -f "$DRAFT" ]] || { echo "missing DSpark model: $DRAFT" >&2; exit 1; }
fi

export CUDA_VISIBLE_DEVICES=0,1,2,3,4,5,6,7
export LD_LIBRARY_PATH="/usr/local/cuda-12.1/lib64:$(dirname "$BIN")${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LD_PRELOAD="$ROOT/runtime/libreaddir_errno_fix.so${LD_PRELOAD:+:$LD_PRELOAD}"
export OMP_NUM_THREADS=96
if [[ "$DISABLE_CUDA_GRAPHS" == 1 ]]; then
  export GGML_CUDA_DISABLE_GRAPHS=1
fi

args=(
  --model "$MODEL" --alias "$ALIAS" --host 127.0.0.1 --port "$PORT"
  --ctx-size "$CONTEXT_SIZE" --parallel "$PARALLEL"
  --batch-size "$BATCH_SIZE" --ubatch-size "$UBATCH_SIZE"
  --threads 48 --threads-batch 96 --numa distribute
  --n-gpu-layers all --split-mode layer --tensor-split 1,1,1,1,1,1,1,1
  --fit off --flash-attn on --cache-type-k "$CACHE_K" --cache-type-v "$CACHE_V"
  --cache-ram 65536 --cache-idle-slots --jinja
  --reasoning-format deepseek --reasoning-budget -1
  --metrics --slots --offline
)
if [[ "$ENABLE_DSPARK" == 1 ]]; then
  args+=(
    --spec-draft-model "$DRAFT" --spec-type draft-dspark
    --spec-draft-device CUDA7,CUDA1,CUDA3,CUDA5 --spec-draft-ngl all
    --spec-draft-type-k "$DRAFT_CACHE_K" --spec-draft-type-v "$DRAFT_CACHE_V"
    --spec-draft-n-max "$DSPARK_N_MAX" --spec-draft-backend-sampling
  )
fi

exec "$BIN" "${args[@]}"
