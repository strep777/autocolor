from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from ..core.security import (
    clear_login_failures,
    client_ip,
    hash_password,
    login_blocked,
    new_session_token,
    record_login_failure,
    token_hash,
    verify_password,
)
from ..database import get_db
from ..deps import api_error, clear_session_cookie, get_current_user, optional_user, session_expiry, set_session_cookie
from ..models import SessionRecord, User, utcnow
from ..schemas import ChangePasswordIn, LoginIn
from ..services.audit import audit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(payload: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = client_ip(request)
    if login_blocked(ip):
        raise api_error(429, "too_many_attempts", "尝试次数过多，请 5 分钟后再试")

    user = db.query(User).filter(User.username == payload.username.strip()).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        record_login_failure(ip)
        raise api_error(401, "invalid_credentials", "用户名或密码错误")
    if not user.is_active:
        raise api_error(403, "user_disabled", "账号已被禁用，请联系管理员")

    clear_login_failures(ip)
    raw, hashed = new_session_token()
    db.query(SessionRecord).filter(SessionRecord.expires_at < utcnow()).delete()
    db.add(
        SessionRecord(
            user_id=user.id,
            token_hash=hashed,
            expires_at=session_expiry(),
            user_agent=(request.headers.get("user-agent") or "")[:255],
            ip=ip,
        )
    )
    user.last_login_at = utcnow()
    db.commit()
    set_session_cookie(response, raw, request)
    audit(db, user, "auth.login", "user", str(user.id), ip=ip)
    return {"user": user.to_dict(), "permissions": {"can_manage": user.role == "admin"}}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get("pc_session")
    if raw:
        db.query(SessionRecord).filter(SessionRecord.token_hash == token_hash(raw)).delete()
        db.commit()
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me")
def me(user: Optional[User] = Depends(optional_user)):
    if user is None:
        return {"user": None, "permissions": {"can_manage": False}}
    return {"user": user.to_dict(), "permissions": {"can_manage": user.role == "admin"}}


@router.post("/password")
def change_password(
    payload: ChangePasswordIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise api_error(400, "invalid_password", "当前密码不正确")
    if payload.current_password == payload.new_password:
        raise api_error(400, "same_password", "新密码不能与当前密码相同")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    audit(db, user, "auth.change_password", "user", str(user.id), ip=client_ip(request))
    return {"ok": True, "message": "密码已更新"}
