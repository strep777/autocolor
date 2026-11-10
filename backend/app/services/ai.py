from __future__ import annotations

import json
import re
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

import httpx

from . import settings as settings_service
from ..schemas import AnalyzeIn


class AIError(Exception):
    def __init__(self, message: str, code: str = "ai_error", status: int = 502):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status


def _endpoint(base: str, path: str) -> str:
    base = (base or "").strip().rstrip("/")
    if not base:
        raise AIError("AI 服务地址未配置", "ai_not_configured")
    if path.startswith("http"):
        return path
    return base + path


def _post(url: str, payload: dict, headers: Optional[dict], timeout: float) -> dict:
    last_error: Optional[str] = None
    for attempt in range(2):
        try:
            # 本应用的 AI 端点通常是 api.deepseek.com 或本机 Ollama。
            # 显式忽略系统代理变量，避免 http_proxy 配置损坏（如端口非法）导致所有请求 500，
            # 也避免本机 Ollama 请求被错误地转发到代理。
            with httpx.Client(timeout=timeout, trust_env=False) as client:
                response = client.post(url, json=payload, headers=headers or {})
            if response.status_code >= 500 and attempt == 0:
                last_error = f"服务暂时不可用（HTTP {response.status_code}）"
                time.sleep(0.6)
                continue
            if response.status_code >= 400:
                body = response.text[:300]
                if response.status_code in (401, 403):
                    raise AIError("AI 鉴权失败，请检查 API Key", "ai_auth", 502)
                if response.status_code == 404:
                    raise AIError("AI 接口或模型不存在，请检查地址与模型名", "ai_not_found", 502)
                raise AIError(f"AI 服务返回错误（HTTP {response.status_code}）：{body}", "ai_http", 502)
            return response.json()
        except httpx.InvalidURL:
            raise AIError("AI 服务地址格式不正确，请检查设置", "ai_bad_url")
        except httpx.TimeoutException:
            last_error = "AI 响应超时"
        except httpx.ConnectError:
            last_error = "无法连接 AI 服务，请检查地址与网络"
        except httpx.HTTPError as exc:
            last_error = f"AI 请求失败：{exc.__class__.__name__}"
        if attempt == 0:
            time.sleep(0.6)
    raise AIError(last_error or "AI 调用失败", "ai_unreachable", 502)


def _get(url: str, timeout: float) -> dict:
    try:
        with httpx.Client(timeout=timeout, trust_env=False) as client:
            response = client.get(url)
        if response.status_code == 404:
            raise AIError("没有找到 Ollama 接口，请检查服务地址", "ai_not_found")
        if response.status_code >= 400:
            raise AIError(f"Ollama 返回错误（HTTP {response.status_code}）", "ai_http")
        return response.json()
    except httpx.InvalidURL:
        raise AIError("Ollama 服务地址格式不正确，请检查设置", "ai_bad_url")
    except httpx.TimeoutException:
        raise AIError("连接 Ollama 超时，请确认本机服务已启动", "ai_timeout")
    except httpx.ConnectError:
        raise AIError("无法连接 Ollama，请确认已运行 ollama serve（默认 11434 端口）", "ai_unreachable")
    except httpx.HTTPError:
        raise AIError("Ollama 请求失败，请检查服务状态", "ai_unreachable")


def list_ollama_models(base_url: str, timeout: float = 8.0) -> List[Dict[str, Any]]:
    """读取 Ollama /api/tags，返回本机已下载的模型（按名称排序）。"""
    url = _endpoint(base_url or "http://localhost:11434", "/api/tags")
    data = _get(url, timeout)
    raw = data.get("models") if isinstance(data, dict) else None
    models: List[Dict[str, Any]] = []
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        name = item.get("name") or item.get("model")
        if not name:
            continue
        details = item.get("details") if isinstance(item.get("details"), dict) else {}
        models.append(
            {
                "name": str(name),
                "size": int(item.get("size") or 0),
                "modified_at": item.get("modified_at") or "",
                "family": details.get("family") or "",
                "parameter_size": details.get("parameter_size") or "",
                "quantization_level": details.get("quantization_level") or "",
            }
        )
    models.sort(key=lambda model: model["name"].lower())
    return models


def suggest_ollama_model(models: Sequence[Dict[str, Any]], current: str = "") -> str:
    names = [model["name"] for model in models]
    if current and current in names:
        return current
    for preferred in ("qwen2.5:3b",):
        if preferred in names:
            return preferred
    # qwen2.5 比 qwen3 更听指令，纯 CPU 环境下也更稳，优先于通用 qwen3。
    for prefix in ("qwen2.5", "qwen3.5", "qwen2", "llama", "deepseek", "qwen3", "qwen"):
        for name in names:
            if name.lower().startswith(prefix):
                return name
    return names[0] if names else ""


def chat(cfg: Dict[str, Any], provider: str, system: str, user: str, max_tokens: int = 1200) -> str:
    if not cfg.get("enabled", True):
        raise AIError("AI 功能未启用", "ai_disabled")
    timeout = float(cfg.get("timeout_seconds") or 40)
    temperature = float(cfg.get("temperature") if cfg.get("temperature") is not None else 0.3)

    if provider == "deepseek":
        api_key = cfg.get("deepseek_api_key") or ""
        if not api_key:
            raise AIError("尚未配置 DeepSeek API Key", "ai_not_configured")
        url = _endpoint(cfg.get("deepseek_base_url", "https://api.deepseek.com"), "/chat/completions")
        payload = {
            "model": cfg.get("deepseek_model") or "deepseek-chat",
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
            "response_format": {"type": "json_object"},
        }
        data = _post(url, payload, {"Authorization": f"Bearer {api_key}"}, timeout)
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError):
            raise AIError("DeepSeek 返回结构异常", "ai_bad_response")

    if provider == "ollama":
        url = _endpoint(cfg.get("ollama_base_url", "http://localhost:11434"), "/api/chat")
        payload = {
            "model": cfg.get("ollama_model") or "qwen2.5:3b",
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
            "format": "json",
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        data = _post(url, payload, None, timeout)
        try:
            return data["message"]["content"] or ""
        except (KeyError, TypeError):
            raise AIError("Ollama 返回结构异常", "ai_bad_response")

    raise AIError(f"未知的 AI 提供商：{provider}", "ai_bad_provider")


def chat_text(cfg: Dict[str, Any], provider: str, system: str, user: str, max_tokens: int = 900) -> str:
    """自由文本（分析用）。DeepSeek 不强制 JSON；Ollama 去掉 format=json。"""
    if provider == "ollama":
        if not cfg.get("enabled", True):
            raise AIError("AI 功能未启用", "ai_disabled")
        url = _endpoint(cfg.get("ollama_base_url", "http://localhost:11434"), "/api/chat")
        payload = {
            "model": cfg.get("ollama_model") or "qwen2.5:3b",
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
            "options": {"temperature": float(cfg.get("temperature") or 0.3), "num_predict": max_tokens},
        }
        data = _post(url, payload, None, float(cfg.get("timeout_seconds") or 40))
        try:
            return (data["message"]["content"] or "").strip()
        except (KeyError, TypeError):
            raise AIError("Ollama 返回结构异常", "ai_bad_response")

    if provider == "deepseek":
        cfg2 = dict(cfg)
        api_key = cfg.get("deepseek_api_key") or ""
        if not api_key:
            raise AIError("尚未配置 DeepSeek API Key", "ai_not_configured")
        url = _endpoint(cfg.get("deepseek_base_url", "https://api.deepseek.com"), "/chat/completions")
        payload = {
            "model": cfg.get("deepseek_model") or "deepseek-chat",
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": float(cfg2.get("temperature") or 0.5),
            "max_tokens": max_tokens,
            "stream": False,
        }
        data = _post(url, payload, {"Authorization": f"Bearer {api_key}"}, float(cfg.get("timeout_seconds") or 40))
        try:
            return (data["choices"][0]["message"]["content"] or "").strip()
        except (KeyError, IndexError, TypeError):
            raise AIError("DeepSeek 返回结构异常", "ai_bad_response")

    raise AIError(f"未知的 AI 提供商：{provider}", "ai_bad_provider")


_JSON_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.IGNORECASE | re.DOTALL)


def extract_json(text: str) -> Dict[str, Any]:
    if not text or not text.strip():
        raise AIError("AI 返回为空", "ai_empty")
    raw = text.strip()
    fence = _JSON_FENCE.search(raw)
    if fence:
        raw = fence.group(1).strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        raw = raw[start : end + 1]
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # 容错：去掉尾逗号后再试一次
        fixed = re.sub(r",\s*([}\]])", r"\1", raw)
        try:
            data = json.loads(fixed)
        except json.JSONDecodeError as exc:
            raise AIError(f"AI 返回的 JSON 无法解析：{exc.msg}", "ai_bad_json")
    if not isinstance(data, dict):
        raise AIError("AI 返回的 JSON 不是对象", "ai_bad_json")
    return data


def _coerce_result(data: Dict[str, Any], valid_ids: Sequence[int], limit: int) -> Dict[str, Any]:
    valid = set(int(i) for i in valid_ids)
    ranking: List[Dict[str, Any]] = []
    seen = set()
    raw_ranking = data.get("ranking")
    if isinstance(raw_ranking, list):
        for item in raw_ranking:
            if not isinstance(item, dict):
                continue
            try:
                cid = int(item.get("id"))
            except (TypeError, ValueError):
                continue
            if cid not in valid or cid in seen:
                continue
            try:
                score = float(item.get("score", 0))
            except (TypeError, ValueError):
                score = 0.0
            score = max(0.0, min(100.0, score))
            reason = str(item.get("reason", "")).strip()[:120]
            if not reason:
                reason = "与目标色接近"
            seen.add(cid)
            ranking.append({"id": cid, "score": round(score, 1), "reason": reason})
            if len(ranking) >= limit:
                break

    def text(key: str, cap: int) -> str:
        value = data.get(key, "")
        if not isinstance(value, str):
            value = str(value)
        return value.strip()[:cap]

    return {
        "summary": text("summary", 160),
        "ranking": ranking,
        "advice": text("advice", 200),
        "caution": text("caution", 160),
    }


def rank_candidates(
    db,
    provider: Optional[str],
    query: Dict[str, Any],
    candidates: List[Dict[str, Any]],
    limit: int,
) -> Tuple[Dict[str, Any], str, int]:
    cfg = settings_service.get_ai_config(db, provider)
    active = cfg["provider"]
    system = cfg["prompt_deepseek"] if active == "deepseek" else cfg["prompt_ollama"]
    payload = {
        "query": query,
        "candidates": [
            {
                "id": c["id"],
                "title": c["title"],
                "material": c.get("material", ""),
                "hex": c["hex"],
                "delta_e": c["delta_e"],
                "score": c["score"],
                "family": c.get("family", ""),
                "price_cents": c.get("price_cents"),
            }
            for c in candidates
        ],
    }
    started = time.perf_counter()
    content = chat(cfg, active, system, json.dumps(payload, ensure_ascii=False), max_tokens=1500)
    data = extract_json(content)
    result = _coerce_result(data, [c["id"] for c in candidates], limit)
    elapsed = int((time.perf_counter() - started) * 1000)
    return result, active, elapsed


def analyze_color(db, payload: AnalyzeIn, provider: Optional[str] = None) -> Tuple[str, str, int]:
    cfg = settings_service.get_ai_config(db, provider)
    active = cfg["provider"]
    system = cfg["prompt_analyze"]
    user = json.dumps(
        {
            "hex": payload.hex,
            "scene": payload.scene,
            "material": payload.material,
            "question": payload.question,
        },
        ensure_ascii=False,
    )
    started = time.perf_counter()
    content = chat_text(cfg, active, system, user, max_tokens=700)
    elapsed = int((time.perf_counter() - started) * 1000)
    if not content:
        raise AIError("AI 未返回内容", "ai_empty")
    return content, active, elapsed


def test_provider(db, provider: Optional[str]) -> Dict[str, Any]:
    cfg = settings_service.get_ai_config(db, provider)
    active = cfg["provider"]
    started = time.perf_counter()
    content = chat(
        cfg,
        active,
        "你是连通性测试助手。只输出 JSON。",
        '请输出 {"ok": true}',
        max_tokens=200,
    )
    elapsed = int((time.perf_counter() - started) * 1000)
    preview = content.strip()[:120]
    return {
        "ok": True,
        "provider": active,
        "model": cfg.get("deepseek_model") if active == "deepseek" else cfg.get("ollama_model"),
        "elapsed_ms": elapsed,
        "preview": preview,
    }
