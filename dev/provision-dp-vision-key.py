from __future__ import annotations

import argparse
import ctypes
import os
from typing import Any
import uuid
import winreg

import httpx

from developer_platform_cli.runtime import load_authenticated_client


DP_PROJECT_ID = "a2d64009-e8d3-4d19-bfbe-aadf8a455756"


def unwrap(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise RuntimeError("DP returned a non-object response")
    data = payload.get("data", payload)
    if not isinstance(data, dict):
        raise RuntimeError("DP returned an invalid data envelope")
    return data


def persist_user_environment(name: str, value: str) -> None:
    with winreg.OpenKey(
        winreg.HKEY_CURRENT_USER,
        r"Environment",
        0,
        winreg.KEY_SET_VALUE,
    ) as key:
        winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)
    os.environ[name] = value
    # Notify newly launched desktop processes without exposing the value on a
    # command line. Existing processes still need a controlled restart.
    ctypes.windll.user32.SendMessageTimeoutW(  # type: ignore[attr-defined]
        0xFFFF,
        0x001A,
        0,
        "Environment",
        0x0002,
        5000,
        None,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Create and store a DSH vision Relay key")
    parser.add_argument("--name", default="DSH 视觉桥生产 2026-08-22")
    parser.add_argument("--tenant-name", default="Deepseek Harness")
    parser.add_argument("--tenant-slug", default="dsh-vision-bridge")
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--relay-url", default="https://ai.chuansgu.top/v1")
    args = parser.parse_args()
    if not 1 <= args.concurrency <= 64:
        raise SystemExit("concurrency must be between 1 and 64")

    _, profile, token, _ = load_authenticated_client(project_id=DP_PROJECT_ID)
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Project-ID": DP_PROJECT_ID,
        "Idempotency-Key": str(uuid.uuid4()),
        "Content-Type": "application/json",
    }
    with httpx.Client(base_url=profile.base_url, headers=headers, timeout=30) as client:
        dashboard = client.get("/api/v1/ai-relay", params={"query": args.name})
        dashboard.raise_for_status()
        items = unwrap(dashboard.json()).get("items") or []
        if any(isinstance(item, dict) and item.get("name") == args.name for item in items):
            raise SystemExit(
                "an AI Relay key with this name already exists; refusing to create a duplicate"
            )
        response = client.post(
            "/api/v1/ai-relay/keys",
            json={
                "tenant_name": args.tenant_name,
                "tenant_slug": args.tenant_slug,
                "key_name": args.name,
                "concurrency_limit": args.concurrency,
            },
        )
        response.raise_for_status()
        issued = unwrap(response.json())
    secret = str(issued.get("secret") or "")
    if not secret.startswith("dpa_"):
        raise RuntimeError("DP did not return a valid Relay key")
    persist_user_environment("DPGATEWAY_API_KEY", secret)

    relay_headers = {"Authorization": f"Bearer {secret}"}
    models = httpx.get(
        f"{args.relay_url.rstrip('/')}/models",
        headers=relay_headers,
        timeout=30,
    )
    models.raise_for_status()
    model_ids = [
        str(item.get("id"))
        for item in (models.json().get("data") or [])
        if isinstance(item, dict) and item.get("id")
    ]
    if "Qwen3.8-Flash-Next-FP8" not in model_ids:
        raise RuntimeError("Relay key works, but the static vision model is not published")
    print(
        "DP_VISION_KEY_CONFIGURED "
        f"key_id={issued.get('id')} env=DPGATEWAY_API_KEY models={','.join(model_ids)}"
    )


if __name__ == "__main__":
    main()
