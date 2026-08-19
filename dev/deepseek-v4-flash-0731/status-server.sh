#!/usr/bin/env bash
set -euo pipefail

ROOT=/data1/gys/deepseek-v4
source "$ROOT/scripts/select-nvidia-driver-libs.sh"
echo "NVIDIA kernel=${NVIDIA_KERNEL_VERSION}; userspace=${NVIDIA_DRIVER_LIBRARY_SOURCE}"
screen -list | grep -E 'deepseek_v4_(server|q4|q8)' || true
curl -fsS --max-time 3 http://127.0.0.1:23341/health 2>/dev/null || true
echo
nvidia-smi --query-gpu=index,memory.used,memory.total,utilization.gpu,power.draw \
  --format=csv,noheader,nounits
