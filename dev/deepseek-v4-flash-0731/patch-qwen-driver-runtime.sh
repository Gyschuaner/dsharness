#!/usr/bin/env bash
set -euo pipefail

TARGET=/data1/gys/qwen38/scripts/start_qwen38_sglang_nextn_experiment.sh
BACKUP="${TARGET}.pre-dsh013-driver-auto"
HELPER=/data1/gys/deepseek-v4/scripts/select-nvidia-driver-libs.sh

[[ -f "$TARGET" ]] || { echo "missing Qwen launcher: $TARGET" >&2; exit 1; }
[[ -f "$HELPER" ]] || { echo "missing NVIDIA runtime selector: $HELPER" >&2; exit 1; }
[[ -f "$BACKUP" ]] || cp -p "$TARGET" "$BACKUP"

if grep -q '^COMPAT_LIBS=' "$TARGET"; then
  sed -i 's|^COMPAT_LIBS=.*$|source /data1/gys/deepseek-v4/scripts/select-nvidia-driver-libs.sh|' "$TARGET"
fi
if grep -q '^export LD_LIBRARY_PATH="${COMPAT_LIBS}:' "$TARGET"; then
  sed -i 's|^export LD_LIBRARY_PATH=.*$|export LD_LIBRARY_PATH="${LD_LIBRARY_PATH:+${LD_LIBRARY_PATH}:}${CUDA_HOME}/lib"|' "$TARGET"
fi

bash -n "$TARGET"
grep -nE 'select-nvidia-driver-libs|LD_LIBRARY_PATH' "$TARGET"
