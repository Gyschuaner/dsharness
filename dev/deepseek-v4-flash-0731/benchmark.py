#!/usr/bin/env python3
from __future__ import annotations

import argparse
import concurrent.futures
from dataclasses import asdict, dataclass
import json
from pathlib import Path
import statistics
import time
from typing import Any
import urllib.error
import urllib.request


@dataclass
class Result:
    name: str
    ok: bool
    status: int
    wall_s: float
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    tok_s: float
    response: dict[str, Any] | None
    error: str | None


def post_json(url: str, payload: dict[str, Any], timeout: float = 1800) -> tuple[int, dict[str, Any]]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            return exc.code, json.loads(body)
        except json.JSONDecodeError:
            return exc.code, {"raw": body}


def run_chat(base_url: str, name: str, payload: dict[str, Any]) -> Result:
    started = time.perf_counter()
    try:
        status, body = post_json(f"{base_url}/v1/chat/completions", payload)
        wall_s = time.perf_counter() - started
        usage = body.get("usage") or {}
        timings = body.get("timings") or {}
        return Result(
            name=name,
            ok=status == 200,
            status=status,
            wall_s=wall_s,
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
            total_tokens=int(usage.get("total_tokens") or 0),
            tok_s=float(timings.get("predicted_per_second") or 0),
            response=body,
            error=None,
        )
    except Exception as exc:  # noqa: BLE001 - the benchmark must record transport failures
        return Result(name, False, 0, time.perf_counter() - started, 0, 0, 0, 0, None, repr(exc))


def base_payload(model: str, prompt: str, max_tokens: int, effort: str = "high") -> dict[str, Any]:
    return {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": 0.6,
        "top_p": 0.95,
        "reasoning_effort": effort,
        "seed": 20260819,
    }


def mixed_tasks(model: str, max_tokens: int) -> list[tuple[str, dict[str, Any]]]:
    return [
        (
            "architecture_cn",
            base_payload(
                model,
                "设计一个跨两个可用区的订单系统：要求幂等、最终一致、RPO=0、单区故障不中断。"
                "请给出组件、写入时序、故障切换、回切和可观测性方案，并明确最难的三个权衡。",
                max_tokens,
            ),
        ),
        (
            "code_python",
            base_payload(
                model,
                "实现 Python 3.11 的异步有界并发 map：保持输入顺序、支持超时和取消、"
                "首个异常后停止接收新任务，但必须回收已启动任务。给出代码、复杂度和最小测试。",
                max_tokens,
            ),
        ),
        (
            "incident_reasoning",
            base_payload(
                model,
                "线上症状：P99 从80ms升到4s，CPU 35%，数据库连接池满，慢查询无增长，"
                "发布后20分钟出现，回滚无效，重启应用短暂恢复。请按概率排序根因，"
                "设计不扩大事故面的验证步骤，并给出止血与根治方案。",
                max_tokens,
            ),
        ),
        (
            "structured_json",
            {
                **base_payload(
                    model,
                    "把下面需求转成 JSON：三阶段迁移，阶段1只读影子流量，阶段2双写5%，阶段3全量；"
                    "每阶段含进入条件、退出条件、指标、回滚动作。不要输出 JSON 之外的文字。",
                    max_tokens,
                ),
                "response_format": {"type": "json_object"},
            },
        ),
    ]


def tool_task(model: str) -> tuple[str, dict[str, Any]]:
    payload = base_payload(
        model,
        "请查询北京和上海现在的天气，比较后告诉我哪个更适合户外跑步。你必须先调用工具，不能猜测。",
        512,
    )
    payload["tools"] = [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "Get current weather for a city",
                "parameters": {
                    "type": "object",
                    "properties": {"city": {"type": "string"}},
                    "required": ["city"],
                },
            },
        }
    ]
    payload["tool_choice"] = "auto"
    return "parallel_weather_tool_call", payload


def run_concurrency(base_url: str, model: str, concurrency: int, max_tokens: int) -> list[Result]:
    tasks = mixed_tasks(model, max_tokens)
    jobs = [(f"c{idx + 1}_{tasks[idx % len(tasks)][0]}", tasks[idx % len(tasks)][1]) for idx in range(concurrency)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(run_chat, base_url, name, payload) for name, payload in jobs]
        return [future.result() for future in futures]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:23341")
    parser.add_argument("--model", required=True)
    parser.add_argument("--mode", choices=["mixed", "tool", "concurrency"], default="mixed")
    parser.add_argument("--max-tokens", type=int, default=512)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    if args.mode == "mixed":
        results = [run_chat(args.base_url, name, payload) for name, payload in mixed_tasks(args.model, args.max_tokens)]
    elif args.mode == "tool":
        name, payload = tool_task(args.model)
        results = [run_chat(args.base_url, name, payload)]
    else:
        results = run_concurrency(args.base_url, args.model, args.concurrency, args.max_tokens)

    rows = [asdict(result) for result in results]
    speeds = [result.tok_s for result in results if result.ok and result.tok_s > 0]
    output = {
        "mode": args.mode,
        "count": len(results),
        "ok": sum(result.ok for result in results),
        "tok_s_mean": statistics.fmean(speeds) if speeds else 0,
        "tok_s_median": statistics.median(speeds) if speeds else 0,
        "results": rows,
    }
    rendered = json.dumps(output, ensure_ascii=False, indent=2)
    print(rendered)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
