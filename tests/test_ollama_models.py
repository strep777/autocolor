"""Ollama 模型自动发现与模型推荐逻辑的离线单元测试。

运行：.venv\\Scripts\\python.exe tests\\test_ollama_models.py
不依赖真实 Ollama；用本地 HTTP 桩验证 /api/tags 解析、排序、错误映射。
"""
import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.services import ai  # noqa: E402


PAYLOAD = {
    "models": [
        {"name": "llama3.2:3b", "size": 2_000_000_000, "details": {"family": "llama", "parameter_size": "3B", "quantization_level": "Q4_K_M"}},
        {"name": "qwen3.5:9b", "size": 5_800_000_000, "details": {"family": "qwen3.5", "parameter_size": "9B", "quantization_level": "Q4_K_M"}},
        {"name": "", "size": 1},
        "not-a-dict",
        {"name": "qwen3:4b", "size": 2_500_000_000},
    ]
}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path == "/api/tags":
            body = json.dumps(PAYLOAD).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):
        pass


class OllamaModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_list_models_parses_filters_and_sorts(self):
        models = ai.list_ollama_models(f"http://127.0.0.1:{self.port}")
        self.assertEqual([m["name"] for m in models], ["llama3.2:3b", "qwen3.5:9b", "qwen3:4b"])
        qwen = next(m for m in models if m["name"] == "qwen3.5:9b")
        self.assertEqual(qwen["parameter_size"], "9B")
        self.assertEqual(qwen["quantization_level"], "Q4_K_M")
        self.assertEqual(qwen["size"], 5_800_000_000)

    def test_missing_endpoint_maps_to_not_found(self):
        with self.assertRaises(ai.AIError) as ctx:
            ai.list_ollama_models(f"http://127.0.0.1:{self.port}/nope")
        self.assertEqual(ctx.exception.code, "ai_not_found")

    def test_unreachable_has_friendly_message(self):
        with self.assertRaises(ai.AIError) as ctx:
            ai.list_ollama_models("http://127.0.0.1:1", timeout=1)
        self.assertIn(ctx.exception.code, ("ai_unreachable", "ai_timeout"))
        self.assertIn("Ollama", ctx.exception.message)

    def test_suggest_prefers_current_then_qwen35_then_family(self):
        models = [{"name": "qwen3:4b"}, {"name": "qwen3.5:9b"}]
        self.assertEqual(ai.suggest_ollama_model(models, "qwen3:4b"), "qwen3:4b")
        self.assertEqual(ai.suggest_ollama_model(models, "missing"), "qwen3.5:9b")
        self.assertEqual(ai.suggest_ollama_model([{"name": "llama3.2:3b"}], ""), "llama3.2:3b")
        self.assertEqual(ai.suggest_ollama_model([], "x"), "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
