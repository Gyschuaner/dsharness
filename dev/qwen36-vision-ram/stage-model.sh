#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_ROOT="${SOURCE_ROOT:-/data1/gys/models/Qwen3.6-35B-A3B-GGUF}"
RAM_ROOT="${RAM_ROOT:-/dev/shm/gys/qwen36-q8}"
MODEL_NAME="${MODEL_NAME:-Qwen3.6-35B-A3B-Q8_0.gguf}"
MMPROJ_NAME="${MMPROJ_NAME:-mmproj-BF16.gguf}"

[[ "$RAM_ROOT" == /dev/shm/* && "$RAM_ROOT" != /dev/shm/ ]] || {
  printf 'RAM_ROOT must be a child of /dev/shm\n' >&2
  exit 2
}
for name in "$MODEL_NAME" "$MMPROJ_NAME"; do
  source_file="$SOURCE_ROOT/$name"
  target_file="$RAM_ROOT/$name"
  [[ -f "$source_file" ]] || { printf 'Missing source file: %s\n' "$source_file" >&2; exit 1; }
  mkdir -p "$RAM_ROOT"
  source_size="$(stat -c %s "$source_file")"
  if [[ -f "$target_file" && "$(stat -c %s "$target_file")" == "$source_size" ]] && cmp -s -- "$source_file" "$target_file"; then
    printf 'RAM_FILE_REUSED name=%s bytes=%s\n' "$name" "$source_size"
    continue
  fi
  [[ ! -e "$target_file" ]] || {
    printf 'Existing RAM file differs from source; refusing to overwrite: %s\n' "$target_file" >&2
    exit 1
  }
  available="$(df --output=avail -B1 /dev/shm | tail -n 1 | tr -d ' ')"
  required="$((source_size + 1073741824))"
  (( available >= required )) || {
    printf 'Insufficient /dev/shm capacity for %s: available=%s required=%s\n' \
      "$name" "$available" "$required" >&2
    exit 1
  }
  partial="$target_file.partial.$$"
  trap 'rm -f -- "$partial"' EXIT
  cp -- "$source_file" "$partial"
  [[ "$(stat -c %s "$partial")" == "$source_size" ]] && cmp -s -- "$source_file" "$partial" || {
    printf 'RAM copy content verification failed: %s\n' "$name" >&2
    exit 1
  }
  mv -- "$partial" "$target_file"
  trap - EXIT
  printf 'RAM_FILE_STAGED name=%s bytes=%s\n' "$name" "$source_size"
done

printf 'RAM_MODEL_READY root=%s bytes=%s\n' \
  "$RAM_ROOT" "$(du -sb "$RAM_ROOT" | awk '{print $1}')"
