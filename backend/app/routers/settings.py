from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import defaults
from ..core.security import encrypt_secret, mask_secret
from ..database import get_db
from ..deps import api_error, require_admin
from ..models import Setting, User
from ..schemas import SettingsIn
from ..services import seed as seed_service
from ..services import settings as settings_service
from ..services.audit import audit

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/public")
def public_settings(db: Session = Depends(get_db)):
    return settings_service.public_values(db)


@router.get("")
def get_settings(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    values = settings_service.get_all(db)
    if values.get("ai.deepseek_api_key"):
        values["ai.deepseek_api_key"] = mask_secret(str(values["ai.deepseek_api_key"]))
        values["ai.deepseek_configured"] = True
    else:
        values["ai.deepseek_api_key"] = ""
        values["ai.deepseek_configured"] = False
    return {"values": values}


@router.put("")
def update_settings(
    payload: SettingsIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    allowed = set(defaults.DEFAULT_SETTINGS.keys())
    key = "ai.deepseek_api_key"
    for name, value in payload.values.items():
        if name not in allowed:
            continue
        if name == key:
            if value in (None, ""):
                settings_service.set_value(db, name, "")
            elif isinstance(value, str) and "•" in value:
                continue
            elif isinstance(value, str):
                settings_service.set_value(db, name, encrypt_secret(value.strip()))
            continue
        settings_service.set_value(db, name, value)
    db.commit()
    audit(db, admin, "settings.update", "settings", "", list(payload.values.keys()))
    return get_settings(admin=admin, db=db)


@router.post("/reset-demo")
def reset_demo(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    count = seed_service.reset_demo(db)
    audit(db, admin, "settings.reset_demo", "product", "", {"count": count})
    return {"ok": True, "removed": count, "message": f"已移除 {count} 条示例商品"}


@router.post("/restore-prompts")
def restore_prompts(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    settings_service.set_value(db, "ai.prompt_deepseek", defaults.DEFAULT_PROMPT_DEEPSEEK)
    settings_service.set_value(db, "ai.prompt_ollama", defaults.DEFAULT_PROMPT_OLLAMA)
    settings_service.set_value(db, "ai.prompt_analyze", defaults.DEFAULT_PROMPT_ANALYZE)
    db.commit()
    audit(db, admin, "settings.restore_prompts", "settings", "")
    return {"ok": True, "message": "提示词已恢复默认"}


@router.get("/audit")
def audit_logs(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    from ..models import AuditLog

    rows = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(50).all()
    return {
        "items": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "action": r.action,
                "target_type": r.target_type,
                "target_id": r.target_id,
                "detail": r.detail,
                "created_at": r.created_at.isoformat() + "Z" if r.created_at else None,
            }
            for r in rows
        ]
    }
