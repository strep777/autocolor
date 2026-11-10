from __future__ import annotations

import json
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from .. import defaults
from ..core.security import decrypt_secret
from ..models import Setting


def get_value(db: Session, key: str, fallback: Any = None) -> Any:
    row = db.get(Setting, key)
    if row is None:
        return defaults.DEFAULT_SETTINGS.get(key, fallback)
    try:
        return json.loads(row.value)
    except (ValueError, TypeError):
        return row.value


def get_all(db: Session) -> Dict[str, Any]:
    values: Dict[str, Any] = dict(defaults.DEFAULT_SETTINGS)
    for row in db.query(Setting).all():
        try:
            values[row.key] = json.loads(row.value)
        except (ValueError, TypeError):
            values[row.key] = row.value
    return values


def public_values(db: Session) -> Dict[str, Any]:
    everything = get_all(db)
    return {k: v for k, v in everything.items() if k in defaults.PUBLIC_KEYS}


def set_value(db: Session, key: str, value: Any) -> None:
    payload = json.dumps(value, ensure_ascii=False)
    row = db.get(Setting, key)
    if row is None:
        row = Setting(key=key, value=payload)
        db.add(row)
    else:
        row.value = payload


def set_many(db: Session, values: Dict[str, Any]) -> None:
    for key, value in values.items():
        if key in defaults.DEFAULT_SETTINGS or key.startswith(("ai.", "app.", "appearance.", "recommend.", "security.")):
            set_value(db, key, value)


def get_ai_config(db: Session, provider: Optional[str] = None) -> Dict[str, Any]:
    cfg = {
        "enabled": bool(get_value(db, "ai.enabled", True)),
        "provider": provider or str(get_value(db, "ai.provider", "deepseek")),
        "deepseek_base_url": str(get_value(db, "ai.deepseek_base_url", "https://api.deepseek.com")),
        "deepseek_model": str(get_value(db, "ai.deepseek_model", "deepseek-chat")),
        "deepseek_api_key": decrypt_secret(str(get_value(db, "ai.deepseek_api_key", "") or "")),
        "ollama_base_url": str(get_value(db, "ai.ollama_base_url", "http://localhost:11434")),
        "ollama_model": str(get_value(db, "ai.ollama_model", "qwen2.5:3b")),
        "temperature": float(get_value(db, "ai.temperature", 0.3)),
        "timeout_seconds": int(get_value(db, "ai.timeout_seconds", 40)),
        "prompt_deepseek": str(get_value(db, "ai.prompt_deepseek", defaults.DEFAULT_PROMPT_DEEPSEEK)),
        "prompt_ollama": str(get_value(db, "ai.prompt_ollama", defaults.DEFAULT_PROMPT_OLLAMA)),
        "prompt_analyze": str(get_value(db, "ai.prompt_analyze", defaults.DEFAULT_PROMPT_ANALYZE)),
    }
    return cfg
