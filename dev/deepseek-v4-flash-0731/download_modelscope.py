#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from modelscope import snapshot_download


MODEL_ID = "unsloth/DeepSeek-V4-Flash-0731-GGUF"
VARIANTS = ("UD-Q4_K_XL", "UD-Q8_K_XL")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", choices=VARIANTS, required=True)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    target = Path(f"/data1/gys/models/DeepSeek-V4-Flash-0731-{args.variant}")
    target.mkdir(parents=True, exist_ok=True)
    result = snapshot_download(
        MODEL_ID,
        local_dir=str(target),
        allow_patterns=[
            f"{args.variant}/*.gguf",
            "dspark-DeepSeek-V4-Flash-0731-Q8_0.gguf",
            "README.md",
            "configuration.json",
            "dspark/README.md",
        ],
        max_workers=args.workers,
    )
    print(f"Snapshot completed: {result}")

    total = 0
    for path in sorted(target.rglob("*.gguf")):
        size = path.stat().st_size
        total += size
        print(f"{path.relative_to(target)}\t{size}")
    print(f"GGUF total bytes: {total}")


if __name__ == "__main__":
    main()
