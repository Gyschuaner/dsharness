#!/usr/bin/env bash

# Select userspace NVIDIA libraries that match the currently loaded kernel
# module. The host currently runs a 570 module while its system symlinks point
# at 580, so a private 570 compatibility directory is required until reboot.

NVIDIA_KERNEL_VERSION="$({
  sed -n 's/.*Kernel Module  \([0-9][0-9.]*\).*/\1/p' \
    /proc/driver/nvidia/version 2>/dev/null || true
} | head -n 1)"
NVIDIA_KERNEL_MAJOR="${NVIDIA_KERNEL_VERSION%%.*}"
NVIDIA_COMPAT_DIR="/data1/gys/qwen38/runtime/nvidia${NVIDIA_KERNEL_MAJOR}"

if [[ -n "$NVIDIA_KERNEL_MAJOR" && -f "$NVIDIA_COMPAT_DIR/libcuda.so.1" ]]; then
  export LD_LIBRARY_PATH="$NVIDIA_COMPAT_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  export NVIDIA_DRIVER_LIBRARY_SOURCE="$NVIDIA_COMPAT_DIR"
elif command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then
  export NVIDIA_DRIVER_LIBRARY_SOURCE=system
else
  echo "NVIDIA driver/userspace mismatch: kernel=${NVIDIA_KERNEL_VERSION:-unknown}, no matching compatibility directory" >&2
  return 1 2>/dev/null || exit 1
fi
