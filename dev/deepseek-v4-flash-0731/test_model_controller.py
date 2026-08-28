from __future__ import annotations

import importlib.util
from io import BytesIO
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock


MODULE_PATH = Path(__file__).with_name("model-controller.py")


class FakeResponse:
    def __init__(self, payload: dict):
        self._body = BytesIO(json.dumps(payload).encode("utf-8"))

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, size: int = -1) -> bytes:
        return self._body.read(size)


def load_controller_module(state_file: Path):
    spec = importlib.util.spec_from_file_location("dp035_model_controller", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    with mock.patch.dict(
        os.environ,
        {"MODEL_CONTROL_STATE_FILE": str(state_file)},
        clear=False,
    ), mock.patch(
        "urllib.request.urlopen", return_value=FakeResponse({"data": []})
    ):
        spec.loader.exec_module(module)
    return module


class ModelControllerTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.module = load_controller_module(Path(self.temporary.name) / "state.json")

    def tearDown(self):
        self.temporary.cleanup()

    def test_catalog_contains_flash_next(self):
        self.assertIn("Qwen3.8-Flash-Next-FP8", self.module.MODELS)

    def test_probe_requires_a_real_completion_choice(self):
        target = "Qwen3.8-Flash-Next-FP8"
        with mock.patch.object(
            self.module.urllib.request,
            "urlopen",
            return_value=FakeResponse({"choices": [{"message": {"content": "OK"}}]}),
        ) as request:
            self.assertTrue(self.module.Controller._probe_inference(target))
        payload = json.loads(request.call_args.args[0].data)
        self.assertEqual(payload["model"], target)
        self.assertEqual(payload["messages"][0]["content"], "Reply with OK.")

        with mock.patch.object(
            self.module.urllib.request,
            "urlopen",
            return_value=FakeResponse({"choices": []}),
        ):
            self.assertFalse(self.module.Controller._probe_inference(target))

    def test_wait_ready_retries_when_endpoint_is_up_but_inference_fails(self):
        target = "Qwen3.8-Flash-Next-FP8"
        controller = object.__new__(self.module.Controller)
        controller._detect_model = mock.Mock(return_value=target)
        controller._probe_inference = mock.Mock(side_effect=[False, True])
        with mock.patch.object(
            self.module.time, "monotonic", side_effect=[0.0, 0.1, 0.2]
        ), mock.patch.object(self.module.time, "sleep"):
            controller._wait_ready(target)
        self.assertEqual(controller._probe_inference.call_count, 2)


if __name__ == "__main__":
    unittest.main()
