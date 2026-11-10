from __future__ import annotations

import json
from typing import Optional

from sqlalchemy.orm import Session

from ..models import AuditLog, User


def audit(
    db: Session,
    user: Optional[User],
    action: str,
    target_type: str = "",
    target_id: str = "",
    detail: object = "",
    ip: str = "",
    commit: bool = True,
) -> None:
    payload = detail if isinstance(detail, str) else json.dumps(detail, ensure_ascii=False)
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            action=action,
            target_type=target_type,
            target_id=str(target_id or ""),
            detail=payload[:2000],
            ip=ip or "",
        )
    )
    if commit:
        db.commit()
