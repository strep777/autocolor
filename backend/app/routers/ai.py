from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import defaults
from ..core.security import encrypt_secret, mask_secret
from ..database import get_db
from ..deps import api_error, require_admin
from ..models import User
from ..schemas import AIConfigIn, AITestIn, AnalyzeIn
from ..services import ai as ai_service
from ..services import settings as settings_service

router = APIRouter(prefix="/ai", tags=["ai"])

CONFIG_FIELDS = [
    "enabled",
    "provider",
    "deepseek_base_url",
    "deepseek_model",
    "deepseek_api_key",
    "ollama_base_url",
    "ollama_model",
    "temperature",
    "timeout_seconds",
    "prompt_deepseek",
    "prompt_ollama",
    "prompt_analyze",
]


def _masked(db: Session) -> Dict[str, Any]:
    cfg = settings_service.get_ai_config(db)
    key = cfg.pop("deepseek_api_key", "")
    cfg["deepseek_api_key"] = mask_secret(key)
    cfg["deepseek_configured"] = bool(key)
    return cfg


@router.get("/status")
def status(db: Session = Depends(get_db)):
    cfg = settings_service.get_ai_config(db)
    provider = cfg["provider"]
    return {
        "enabled": cfg["enabled"],
        "provider": provider,
        "model": cfg["deepseek_model"] if provider == "deepseek" else cfg["ollama_model"],
        "configured": bool(cfg["deepseek_api_key"]) if provider == "deepseek" else True,
    }


@router.get("/config")
def get_config(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _masked(db)


@router.put("/config")
def update_config(
    payload: AIConfigIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    data = payload.model_dump(exclude_unset=True)
    api_key = data.pop("deepseek_api_key", None)
    for key, value in data.items():
        if value is not None:
            settings_service.set_value(db, f"ai.{key}", value)
    if api_key is not None:
        if api_key == "":
            settings_service.set_value(db, "ai.deepseek_api_key", "")
        elif not api_key.startswith("•") and "•" not in api_key:
            settings_service.set_value(db, "ai.deepseek_api_key", encrypt_secret(api_key.strip()))
    db.commit()
    return _masked(db)


@router.get("/prompts/default")
def default_prompts(admin: User = Depends(require_admin)):
    return {
        "deepseek": defaults.DEFAULT_PROMPT_DEEPSEEK,
        "ollama": defaults.DEFAULT_PROMPT_OLLAMA,
        "analyze": defaults.DEFAULT_PROMPT_ANALYZE,
    }


@router.get("/ollama/models")
def ollama_models(
    base_url: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """自动读取本机 Ollama 已下载模型，供设置页下拉选择，避免手工填错模型名。"""
    cfg = settings_service.get_ai_config(db)
    base = (base_url or cfg.get("ollama_base_url") or "http://localhost:11434").strip()
    current = cfg.get("ollama_model") or ""
    try:
        models = ai_service.list_ollama_models(base, timeout=min(float(cfg.get("timeout_seconds") or 40), 10.0))
        suggested = ai_service.suggest_ollama_model(models, current)
        return {
            "ok": True,
            "base_url": base,
            "models": models,
            "current": current,
            "suggested": suggested,
            "message": "" if models else "Ollama 已连接，但还没有下载任何模型",
        }
    except ai_service.AIError as exc:
        return {
            "ok": False,
            "base_url": base,
            "models": [],
            "current": current,
            "suggested": "",
            "message": exc.message,
            "code": exc.code,
        }


@router.post("/test")
def test_connection(
    payload: AITestIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        return ai_service.test_provider(db, payload.provider)
    except ai_service.AIError as exc:
        return {"ok": False, "message": exc.message, "code": exc.code}


@router.post("/analyze")
def analyze(
    payload: AnalyzeIn,
    db: Session = Depends(get_db),
):
    try:
        text, provider, elapsed = ai_service.analyze_color(db, payload)
        return {"text": text, "provider": provider, "elapsed_ms": elapsed, "hex": payload.hex}
    except ai_service.AIError as exc:
        raise api_error(502, exc.code, exc.message)
