from __future__ import annotations

from datetime import timedelta
from typing import Optional

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from .config import settings
from .core.security import COOKIE_NAME, token_hash
from .database import get_db
from .models import SessionRecord, User, utcnow


def api_error(status: int, code: str, message: str, fields: Optional[list] = None) -> HTTPException:
    detail = {"code": code, "message": message}
    if fields:
        detail["fields"] = fields
    return HTTPException(status_code=status, detail=detail)


def _read_session(request: Request, db: Session) -> Optional[SessionRecord]:
    raw = request.cookies.get(COOKIE_NAME)
    if not raw:
        return None
    record = db.query(SessionRecord).filter(SessionRecord.token_hash == token_hash(raw)).first()
    if record is None:
        return None
    if record.expires_at < utcnow():
        db.delete(record)
        db.commit()
        return None
    return record


def optional_user(request: Request, db: Session = Depends(get_db)) -> Optional[User]:
    record = _read_session(request, db)
    if record is None:
        return None
    user = db.get(User, record.user_id)
    if user is None or not user.is_active:
        return None
    return user


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = optional_user(request, db)
    if user is None:
        raise api_error(401, "unauthorized", "请先登录")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise api_error(403, "forbidden", "需要管理员权限")
    return user


def set_session_cookie(response: Response, raw: str, request: Request) -> None:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    secure = settings.cookie_secure or proto == "https"
    response.set_cookie(
        key=COOKIE_NAME,
        value=raw,
        max_age=settings.session_days * 86400,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def session_expiry():
    return utcnow() + timedelta(days=settings.session_days)
