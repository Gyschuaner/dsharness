#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
import urllib.request


def post(url: str, payload: dict, timeout: float = 3600) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def token_count(base_url: str, text: str) -> int:
    body = post(f"{base_url}/tokenize", {"content": text, "add_special": False})
    return len(body["tokens"])


def make_prompt(base_url: str, target_tokens: int) -> tuple[str, int]:
    prefix = (
        "BEGIN_KEY=quartz-1709\n"
        "Read the entire record. Ignore filler, remember all three keys, and answer the final request.\n"
    )
    middle = "\nMIDDLE_KEY=nebula-4821\n"
    suffix = (
        "\nEND_KEY=cedar-9364\n"
        "Return one JSON object with exactly begin_key, middle_key, end_key and their values."
    )
    unit = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu\n"

    lo, hi = 0, max(1, target_tokens // 4)
    best_text, best_count = "", 0
    while lo <= hi:
        count = (lo + hi) // 2
        left = count // 2
        text = prefix + unit * left + middle + unit * (count - left) + suffix
        current = token_count(base_url, text)
        if current <= target_tokens:
            best_text, best_count = text, current
            lo = count + 1
        else:
            hi = count - 1
    return best_text, best_count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:23341")
    parser.add_argument("--model", required=True)
    parser.add_argument("--prompt-tokens", type=int, default=256000)
    parser.add_argument("--max-tokens", type=int, default=256)
    args = parser.parse_args()

    prompt, tokenizer_count = make_prompt(args.base_url, args.prompt_tokens)
    started = time.perf_counter()
    result = post(
        f"{args.base_url}/v1/chat/completions",
        {
            "model": args.model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": args.max_tokens,
            "temperature": 0,
            "reasoning_effort": "low",
            "seed": 20260819,
        },
    )
    print(
        json.dumps(
            {
                "requested_prompt_tokens": args.prompt_tokens,
                "tokenizer_count_without_template": tokenizer_count,
                "usage": result.get("usage"),
                "wall_s": time.perf_counter() - started,
                "timings": result.get("timings"),
                "choice": (result.get("choices") or [None])[0],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
