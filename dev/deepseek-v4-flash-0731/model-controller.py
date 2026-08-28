#!/usr/bin/env python3
from __future__ import annotations

import hmac
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
from typing import Any
import urllib.error
import urllib.request


ROOT = Path(os.getenv("MODEL_CONTROL_ROOT", "/data1/gys/deepseek-v4"))
STATE_FILE = Path(os.getenv("MODEL_CONTROL_STATE_FILE", ROOT / "state/model-controller.json"))
SWITCH_SCRIPT = Path(os.getenv("MODEL_CONTROL_SWITCH_SCRIPT", ROOT / "scripts/switch-model.sh"))
MODEL_URL = os.getenv("MODEL_CONTROL_MODEL_URL", "http://127.0.0.1:23341").rstrip("/")
TOKEN = os.environ.get("MODEL_CONTROL_TOKEN", "")
HOST = os.getenv("MODEL_CONTROL_HOST", "127.0.0.1")
PORT = int(os.getenv("MODEL_CONTROL_PORT", "23340"))
START_TIMEOUT = int(os.getenv("MODEL_CONTROL_START_TIMEOUT", "2700"))

MODELS = (
    "Qwen3.8-Flash-Next-FP8",
    "Qwen3.8-27B-FP8",
    "DeepSeek-V4-Flash-0731-Q4_K_XL",
    "DeepSeek-V4-Flash-0731-Q8_K_XL",
)


def utc_timestamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class Controller:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._worker: threading.Thread | None = None
        self._state = self._load_state()
        detected = self._detect_model()
        if detected:
            self._state.update(
                status="ready",
                active_model=detected,
                target_model=None,
                previous_model=None,
                step="ready",
                message="模型服务已就绪",
                service_online=True,
                updated_at=utc_timestamp(),
            )
            self._save_state()
        elif self._state.get("status") == "switching" and self._state.get("target_model") in MODELS:
            target_model = str(self._state["target_model"])
            previous_model = str(self._state.get("previous_model") or "")
            self._state.update(
                step="loading",
                message=f"控制器已恢复，继续等待 {target_model} 加载",
                updated_at=utc_timestamp(),
                service_online=False,
            )
            self._save_state()
            self._worker = threading.Thread(
                target=self._resume_switch_worker,
                args=(target_model, previous_model),
                name="model-switch-recovery",
                daemon=True,
            )
            self._worker.start()

    @staticmethod
    def _default_state() -> dict[str, Any]:
        return {
            "status": "failed",
            "active_model": "Qwen3.8-27B-FP8",
            "target_model": None,
            "previous_model": None,
            "step": "unknown",
            "message": "等待检测模型服务",
            "operation_id": None,
            "started_at": None,
            "updated_at": utc_timestamp(),
            "service_online": False,
        }

    def _load_state(self) -> dict[str, Any]:
        try:
            value = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            return {**self._default_state(), **value} if isinstance(value, dict) else self._default_state()
        except (OSError, json.JSONDecodeError):
            return self._default_state()

    def _save_state(self) -> None:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=STATE_FILE.parent,
            prefix=".model-controller-",
            suffix=".tmp",
            delete=False,
        ) as handle:
            json.dump(self._state, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
            temporary = Path(handle.name)
        os.replace(temporary, STATE_FILE)

    def _set(self, **values: Any) -> dict[str, Any]:
        with self._lock:
            self._state.update(values, updated_at=utc_timestamp())
            self._save_state()
            return self.snapshot()

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {**self._state, "available_models": list(MODELS)}

    def _detect_model(self) -> str | None:
        try:
            with urllib.request.urlopen(f"{MODEL_URL}/v1/models", timeout=3) as response:
                payload = json.load(response)
        except (OSError, urllib.error.URLError, json.JSONDecodeError):
            return None
        candidates: list[str] = []
        for item in payload.get("data") or payload.get("models") or []:
            if isinstance(item, dict):
                candidates.extend(str(item.get(key) or "") for key in ("id", "name", "model"))
        return next((model for model in MODELS if model in candidates), None)

    def status(self) -> dict[str, Any]:
        with self._lock:
            switching = self._state.get("status") == "switching"
        if not switching:
            detected = self._detect_model()
            with self._lock:
                before = (
                    self._state.get("status"),
                    self._state.get("active_model"),
                    self._state.get("step"),
                    self._state.get("service_online"),
                    self._state.get("message"),
                )
                if detected:
                    self._state.update(
                        status="ready",
                        active_model=detected,
                        step="ready",
                        service_online=True,
                        message="模型服务已就绪",
                    )
                else:
                    self._state.update(service_online=False)
                    if self._state.get("status") == "ready":
                        self._state.update(
                            status="failed",
                            step="health_check",
                            message="模型进程不健康；可在 DP 平台重新切换或回滚",
                        )
                after = (
                    self._state.get("status"),
                    self._state.get("active_model"),
                    self._state.get("step"),
                    self._state.get("service_online"),
                    self._state.get("message"),
                )
                if after != before:
                    self._state["updated_at"] = utc_timestamp()
                    self._save_state()
        return self.snapshot()

    def start_switch(
        self,
        *,
        target_model: str,
        expected_active_model: str,
        operation_id: str,
    ) -> tuple[int, dict[str, Any]]:
        if target_model not in MODELS:
            return HTTPStatus.NOT_FOUND, error("MODEL_NOT_FOUND", "请求切换的模型不存在")
        with self._lock:
            if self._state.get("operation_id") == operation_id:
                return HTTPStatus.ACCEPTED, self.snapshot()
            if self._worker is not None and self._worker.is_alive():
                return HTTPStatus.CONFLICT, error("MODEL_SWITCH_BUSY", "已有模型切换任务正在执行")
            active_model = str(self._state.get("active_model") or "")
            if active_model != expected_active_model:
                return HTTPStatus.CONFLICT, error(
                    "ACTIVE_MODEL_CHANGED",
                    f"在线模型已变为 {active_model}，请刷新后重试",
                )
            if target_model == active_model and self._state.get("status") == "ready":
                return HTTPStatus.OK, self.snapshot()
            self._state.update(
                status="switching",
                target_model=target_model,
                previous_model=active_model,
                step="stopping",
                message=f"正在停止 {active_model}",
                operation_id=operation_id,
                started_at=utc_timestamp(),
                service_online=False,
                updated_at=utc_timestamp(),
            )
            self._save_state()
            self._worker = threading.Thread(
                target=self._switch_worker,
                args=(target_model, active_model),
                name=f"model-switch-{operation_id[:12]}",
                daemon=True,
            )
            self._worker.start()
            return HTTPStatus.ACCEPTED, self.snapshot()

    def _run_switch_script(self, target_model: str) -> None:
        result = subprocess.run(
            [str(SWITCH_SCRIPT), target_model],
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=180,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stdout.strip() or f"switch script exited {result.returncode}")

    def _wait_ready(self, target_model: str) -> None:
        deadline = time.monotonic() + START_TIMEOUT
        while time.monotonic() < deadline:
            detected = self._detect_model()
            if detected == target_model and self._probe_inference(target_model):
                return
            time.sleep(3)
        raise TimeoutError(f"{target_model} did not become healthy within {START_TIMEOUT}s")

    @staticmethod
    def _probe_inference(target_model: str) -> bool:
        """Require one real short-prompt forward before declaring readiness.

        The models endpoint can become available before lazy kernels used by
        the first business request have run.  The deliberately short prompt
        also covers QSA's eager short-prefill path on RTX 4090.
        """
        payload = {
            "model": target_model,
            "messages": [{"role": "user", "content": "Reply with OK."}],
            "max_tokens": 1,
            "temperature": 0,
        }
        request = urllib.request.Request(
            f"{MODEL_URL}/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                result = json.load(response)
        except (OSError, urllib.error.URLError, json.JSONDecodeError):
            return False
        return bool(result.get("choices"))

    def _mark_ready(self, target_model: str, previous_model: str) -> None:
        self._set(
            status="ready",
            active_model=target_model,
            target_model=None,
            previous_model=previous_model,
            step="ready",
            message=f"{target_model} 已加载并通过健康检查",
            service_online=True,
        )

    def _handle_switch_failure(
        self,
        target_model: str,
        previous_model: str,
        switch_error: Exception,
    ) -> None:
        rollback_message = ""
        if previous_model in MODELS:
            self._set(step="rollback", message=f"切换失败，正在回滚到 {previous_model}")
            try:
                self._run_switch_script(previous_model)
                self._wait_ready(previous_model)
                rollback_message = f"；已自动回滚到 {previous_model}"
                self._set(active_model=previous_model, service_online=True)
            except Exception as rollback_error:  # noqa: BLE001
                rollback_message = f"；自动回滚也失败：{rollback_error}"
                self._set(service_online=False)
        self._set(
            status="failed",
            target_model=target_model,
            step="failed",
            message=f"切换到 {target_model} 失败：{switch_error}{rollback_message}",
        )

    def _resume_switch_worker(self, target_model: str, previous_model: str) -> None:
        try:
            self._wait_ready(target_model)
            self._mark_ready(target_model, previous_model)
        except Exception as switch_error:  # noqa: BLE001 - persist failure and roll back
            self._handle_switch_failure(target_model, previous_model, switch_error)

    def _switch_worker(self, target_model: str, previous_model: str) -> None:
        try:
            self._run_switch_script(target_model)
            self._set(step="loading", message=f"正在加载 {target_model}")
            self._wait_ready(target_model)
            self._mark_ready(target_model, previous_model)
        except Exception as switch_error:  # noqa: BLE001 - persist the failure and roll back
            self._handle_switch_failure(target_model, previous_model, switch_error)


def error(code: str, message: str) -> dict[str, Any]:
    return {"error": {"code": code, "message": message}}


CONTROLLER = Controller()


class Handler(BaseHTTPRequestHandler):
    server_version = "dsh-model-control/1.0"

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.log_date_time_string()} {self.client_address[0]} {format % args}", flush=True)

    def _authorized(self) -> bool:
        value = self.headers.get("Authorization", "")
        provided = value[7:].strip() if value.lower().startswith("bearer ") else ""
        return bool(TOKEN and hmac.compare_digest(provided, TOKEN))

    def _reply(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if not self._authorized():
            self._reply(HTTPStatus.UNAUTHORIZED, error("INVALID_TOKEN", "控制凭证无效"))
            return
        if self.path == "/health":
            self._reply(HTTPStatus.OK, {"status": "ok"})
        elif self.path == "/v1/status":
            self._reply(HTTPStatus.OK, CONTROLLER.status())
        else:
            self._reply(HTTPStatus.NOT_FOUND, error("NOT_FOUND", "接口不存在"))

    def do_POST(self) -> None:  # noqa: N802
        if not self._authorized():
            self._reply(HTTPStatus.UNAUTHORIZED, error("INVALID_TOKEN", "控制凭证无效"))
            return
        if self.path != "/v1/switch":
            self._reply(HTTPStatus.NOT_FOUND, error("NOT_FOUND", "接口不存在"))
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError):
            self._reply(HTTPStatus.BAD_REQUEST, error("INVALID_JSON", "请求体不是有效 JSON"))
            return
        if not isinstance(payload, dict) or payload.get("confirmation") != "SWITCH":
            self._reply(HTTPStatus.BAD_REQUEST, error("CONFIRMATION_REQUIRED", "缺少明确切换确认"))
            return
        operation_id = str(payload.get("operation_id") or "")[:120]
        if not operation_id:
            self._reply(HTTPStatus.BAD_REQUEST, error("OPERATION_ID_REQUIRED", "缺少操作幂等键"))
            return
        status, response = CONTROLLER.start_switch(
            target_model=str(payload.get("target_model") or ""),
            expected_active_model=str(payload.get("expected_active_model") or ""),
            operation_id=operation_id,
        )
        self._reply(status, response)


def main() -> None:
    if len(TOKEN.encode("utf-8")) < 32:
        raise SystemExit("MODEL_CONTROL_TOKEN must contain at least 32 bytes")
    if not SWITCH_SCRIPT.is_file():
        raise SystemExit(f"missing switch script: {SWITCH_SCRIPT}")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    print(f"model controller listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
