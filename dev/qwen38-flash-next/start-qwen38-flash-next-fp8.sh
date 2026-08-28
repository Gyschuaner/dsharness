#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=/data1/gys/qwen38-flash-next
ENV_DIR="$ROOT/venv-cu128"
MODEL_DIR=/data1/gys/models/Qwen3.8-Flash-Next-FP8
SGLANG_SRC="$ROOT/src/sglang-73a255206f916366c8d26d4022f82ddfb0ab558d/python"
TILELANG_VENDOR="$ROOT/vendor/tilelang-py311-0.1.11-tvmffi-0.1.11"
CUDA_HOME="$ROOT/cuda-toolchain-12.8"

source /data1/gys/deepseek-v4/scripts/select-nvidia-driver-libs.sh

PORT="${PORT:-23341}"
CONTEXT_LENGTH="${CONTEXT_LENGTH:-262144}"
TP_SIZE="${TP_SIZE:-8}"
EP_SIZE="${EP_SIZE:-8}"
# BF16 KV needs about 3.0 GiB/rank for a full 262144-token request. Keep the
# static budget high enough for it, then cap the token pool at native context.
MEM_FRACTION_STATIC="${MEM_FRACTION_STATIC:-0.95}"
MAX_RUNNING_REQUESTS="${MAX_RUNNING_REQUESTS:-4}"
MAX_TOTAL_TOKENS="${MAX_TOTAL_TOKENS:-262144}"
CHUNKED_PREFILL_SIZE="${CHUNKED_PREFILL_SIZE:-2048}"
# extra_buffer + overlap needs five Mamba state slots per live request in this
# pinned SGLang build. Four requests require exactly 20 slots; this reserves
# the admitted concurrency while maximizing activation room for a true 256K
# prefill plus batch-1/2/4 CUDA Graphs. State precision remains BF16.
MAX_MAMBA_CACHE_SIZE="${MAX_MAMBA_CACHE_SIZE:-20}"
CUDA_GRAPH_MAX_BS="${CUDA_GRAPH_MAX_BS:-4}"
ENABLE_MTP="${ENABLE_MTP:-0}"
# Decode CUDA Graph removes Python/kernel-launch overhead from the single-token
# path.  Limit capture to the admitted batch sizes (1/2/4); prefill keeps its
# normal backend.  Set DISABLE_CUDA_GRAPH=1 only as an Ada compatibility
# rollback switch.
DISABLE_CUDA_GRAPH="${DISABLE_CUDA_GRAPH:-0}"

for path in "$ENV_DIR/bin/python" "$MODEL_DIR/config.json" \
  "$MODEL_DIR/model.safetensors.index.json" "$SGLANG_SRC/sglang/__init__.py" \
  "$TILELANG_VENDOR/tilelang/__init__.py" "$CUDA_HOME/bin/nvcc"; do
  [[ -e "$path" ]] || { echo "missing required path: $path" >&2; exit 1; }
done

shard_count="$(find "$MODEL_DIR" -maxdepth 1 -type f -name 'model-*.safetensors' | wc -l)"
[[ "$shard_count" -eq 131 ]] || {
  echo "model download incomplete: expected 131 shards, found $shard_count" >&2
  exit 1
}

export CUDA_VISIBLE_DEVICES=0,1,2,3,4,5,6,7
export CUDA_HOME
export PATH="$ENV_DIR/bin:$CUDA_HOME/bin:$PATH"
export LD_LIBRARY_PATH="${NVIDIA_DRIVER_LIBRARY_SOURCE}:$CUDA_HOME/lib64:$CUDA_HOME/lib:$ENV_DIR/lib/python3.11/site-packages/z3/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LD_PRELOAD="/data1/gys/qwen38/runtime/libreaddir_errno_fix.so${LD_PRELOAD:+:$LD_PRELOAD}"
export PYTHONPATH="$TILELANG_VENDOR:$SGLANG_SRC${PYTHONPATH:+:$PYTHONPATH}"
export HF_HOME="$ROOT/cache/huggingface"
export MODELSCOPE_CACHE="$ROOT/cache/modelscope"
export XDG_CACHE_HOME="$ROOT/cache/xdg"
export SGLANG_CACHE_DIR="$ROOT/cache/sglang"
export TORCHINDUCTOR_CACHE_DIR="$ROOT/cache/torchinductor"
export FLASHINFER_WORKSPACE_BASE="$ROOT/cache/flashinfer"
export TILELANG_CACHE_DIR="$ROOT/cache/tilelang"
export TMPDIR="$ROOT/tmp"
export GLOO_SOCKET_IFNAME="${GLOO_SOCKET_IFNAME:-lo}"
export NCCL_SOCKET_IFNAME="${NCCL_SOCKET_IFNAME:-lo}"
export PYTHONUNBUFFERED=1
# Long 256K prefills allocate sizeable temporary MoE buffers between chunks.
# Expandable segments reduce allocator fragmentation alongside CUDA Graph pools.
export PYTORCH_ALLOC_CONF="${PYTORCH_ALLOC_CONF:-expandable_segments:True}"
# QSA long-context prefill uses TileLang's Cython launcher so it follows the
# active PyTorch CUDA stream without sharing execution handles with FlashInfer.
# NVRTC failed cached repeatability and TVM-FFI invalidated the sampler handle
# after a 250K prefill; both are rejected by the release gate.
export TILELANG_EXECUTION_BACKEND=cython
# Use the validated Ada overlays in the pinned SGLang source tree.
export SGLANG_GROUPED_GEMMA_RMSNORM_BACKEND=triton
export SGLANG_SKIP_SGL_KERNEL_VERSION_CHECK=1

mkdir -p "$HF_HOME" "$MODELSCOPE_CACHE" "$XDG_CACHE_HOME" \
  "$SGLANG_CACHE_DIR" "$TORCHINDUCTOR_CACHE_DIR" \
  "$FLASHINFER_WORKSPACE_BASE" "$TILELANG_CACHE_DIR" "$TMPDIR" "$ROOT/logs"

extra_args=()
if [[ "$DISABLE_CUDA_GRAPH" == 1 ]]; then
  extra_args+=(--disable-cuda-graph)
else
  extra_args+=(--cuda-graph-max-bs-decode "$CUDA_GRAPH_MAX_BS")
fi
if [[ "$ENABLE_MTP" == 1 ]]; then
  extra_args+=(
    --speculative-algorithm NEXTN
    --speculative-num-steps 3
    --speculative-eagle-topk 1
    --speculative-num-draft-tokens 4
  )
fi

exec "$ENV_DIR/bin/python" -m sglang.launch_server \
  --model-path "$MODEL_DIR" \
  --served-model-name Qwen3.8-Flash-Next-FP8 \
  --host 127.0.0.1 \
  --port "$PORT" \
  --tp "$TP_SIZE" \
  --ep "$EP_SIZE" \
  --context-length "$CONTEXT_LENGTH" \
  --mem-fraction-static "$MEM_FRACTION_STATIC" \
  --max-running-requests "$MAX_RUNNING_REQUESTS" \
  --max-total-tokens "$MAX_TOTAL_TOKENS" \
  --max-mamba-cache-size "$MAX_MAMBA_CACHE_SIZE" \
  --disable-custom-all-reduce \
  --weight-loader-prefetch-checkpoints \
  --weight-loader-prefetch-num-threads 2 \
  --chunked-prefill-size "$CHUNKED_PREFILL_SIZE" \
  --max-prefill-tokens "$CHUNKED_PREFILL_SIZE" \
  --linear-attn-prefill-backend triton \
  --linear-attn-decode-backend triton \
  --sampling-backend pytorch \
  --mamba-ssm-dtype bfloat16 \
  --ple-offload-embedding \
  --reasoning-parser auto \
  --tool-call-parser auto \
  --limit-mm-data-per-request '{"image":9,"video":3}' \
  --enable-cache-report \
  --enable-metrics \
  --watchdog-timeout 1800 \
  --trust-remote-code \
  "${extra_args[@]}"
