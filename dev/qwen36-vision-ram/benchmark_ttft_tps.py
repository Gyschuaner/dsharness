#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
from pathlib import Path
import statistics
import time
from typing import Any
import urllib.request


def image_content(path: Path) -> dict[str, Any]:
    media_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{encoded}"}}


def run_once(args: argparse.Namespace) -> dict[str, Any]:
    content: str | list[dict[str, Any]] = args.prompt
    if args.image:
        content = [{"type": "text", "text": args.prompt}, image_content(args.image)]
    payload = {
        "model": args.model,
        "messages": [{"role": "user", "content": content}],
        "stream": True,
        "stream_options": {"include_usage": True},
        "max_tokens": args.max_tokens,
        "temperature": 0,
        "chat_template_kwargs": {"enable_thinking": False},
    }
    if args.threads is not None:
        payload["n_threads"] = args.threads
    headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}
    api_key = os.getenv("BENCHMARK_API_KEY", "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(
        f"{args.base_url.rstrip('/')}/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    started = time.perf_counter()
    first_token_at: float | None = None
    usage: dict[str, Any] = {}
    timings: dict[str, Any] = {}
    text_fragments: list[str] = []
    with urllib.request.urlopen(request, timeout=args.timeout) as response:
        for raw_line in response:
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                event = json.loads(data)
            except json.JSONDecodeError:
                continue
            if isinstance(event.get("usage"), dict):
                usage = event["usage"]
            if isinstance(event.get("timings"), dict):
                timings = event["timings"]
            choices = event.get("choices") or []
            if not choices:
                continue
            delta = choices[0].get("delta") or {}
            fragments = [delta.get("reasoning_content"), delta.get("content")]
            visible = "".join(fragment for fragment in fragments if isinstance(fragment, str))
            if visible:
                first_token_at = first_token_at or time.perf_counter()
                text_fragments.append(visible)
    ended = time.perf_counter()
    completion_tokens = int(usage.get("completion_tokens") or 0)
    ttft = (first_token_at - started) if first_token_at is not None else None
    decode_seconds = (ended - first_token_at) if first_token_at is not None else None
    measured_tps = None
    if decode_seconds and decode_seconds > 0 and completion_tokens > 1:
        measured_tps = (completion_tokens - 1) / decode_seconds
    draft_n = int(timings.get("draft_n") or 0)
    draft_n_accepted = int(timings.get("draft_n_accepted") or 0)
    return {
        "ok": first_token_at is not None,
        "ttft_seconds": ttft,
        "wall_seconds": ended - started,
        "decode_seconds": decode_seconds,
        "completion_tokens": completion_tokens,
        "prompt_tokens": int(usage.get("prompt_tokens") or 0),
        "measured_tps": measured_tps,
        "requested_threads": args.threads,
        "server_timings": timings,
        "draft_acceptance_rate": (
            draft_n_accepted / draft_n if draft_n > 0 else None
        ),
        "output_preview": "".join(text_fragments)[:240],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Measure streaming TTFT and decode TPS")
    parser.add_argument("--base-url", default="http://127.0.0.1:23343/v1")
    parser.add_argument("--model", default="Qwen3.6-35B-A3B")
    parser.add_argument("--prompt", default="用一句话说明你看到了什么。")
    parser.add_argument("--image", type=Path)
    parser.add_argument("--max-tokens", type=int, default=128)
    parser.add_argument("--rounds", type=int, default=2)
    parser.add_argument(
        "--threads",
        type=int,
        help="Optional per-request decode thread override for compatible servers",
    )
    parser.add_argument("--timeout", type=float, default=900)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    rows = [run_once(args) for _ in range(args.rounds)]
    ttfts = [row["ttft_seconds"] for row in rows if row["ttft_seconds"] is not None]
    speeds = [row["measured_tps"] for row in rows if row["measured_tps"] is not None]
    acceptance_rates = [
        row["draft_acceptance_rate"]
        for row in rows
        if row["draft_acceptance_rate"] is not None
    ]
    result = {
        "base_url": args.base_url,
        "model": args.model,
        "kind": "image" if args.image else "text",
        "rounds": rows,
        "ttft_median_seconds": statistics.median(ttfts) if ttfts else None,
        "tps_mean": statistics.mean(speeds) if speeds else None,
        "tps_median": statistics.median(speeds) if speeds else None,
        "draft_acceptance_rate_mean": (
            statistics.mean(acceptance_rates) if acceptance_rates else None
        ),
        "draft_acceptance_rate_median": (
            statistics.median(acceptance_rates) if acceptance_rates else None
        ),
    }
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    print(rendered)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
