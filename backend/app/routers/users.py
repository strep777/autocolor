from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.security import hash_password
from ..database import get_db
from ..deps import api_error, require_admin
from ..models import AuditLog, SessionRecord, User
from ..schemas import PasswordResetIn, UserCreateIn, UserUpdateIn
from ..services.audit import audit

router = APIRouter(prefix="/users", tags=["users"])


def _active_admin_count(db: Session) -> int:
    return db.query(func.count(User.id)).filter(User.role == "admin", User.is_active.is_(True)).scalar() or 0


@router.get("")
def list_users(
    q: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter((User.username.ilike(like)) | (User.display_name.ilike(like)))
    total = query.count()
    rows = query.order_by(User.id.asc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [u.to_dict() for u in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if total else 0,
    }


@router.post("")
def create_user(
    payload: UserCreateIn,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.username == payload.username.strip()).first():
        raise api_error(409, "username_exists", "用户名已存在")
    user = User(
        username=payload.username.strip(),
        password_hash=hash_password(payload.password),
        display_name=payload.display_name.strip() or payload.username.strip(),
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    audit(db, admin, "user.create", "user", str(user.id), {"username": user.username, "role": user.role}, ip=request.client.host if request.client else "")
    return {"user": user.to_dict()}


@router.patch("/{user_id}")
def update_user(
    user_id: int,
    payload: UserUpdateIn,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if target is None:
        raise api_error(404, "not_found", "用户不存在")

    if target.id == admin.id and payload.is_active is False:
        raise api_error(400, "cannot_disable_self", "不能禁用当前登录账号")

    demoting = target.role == "admin" and payload.role is not None and payload.role != "admin"
    disabling = target.is_active and payload.is_active is False
    if target.role == "admin" and (demoting or disabling) and _active_admin_count(db) <= 1:
        raise api_error(400, "last_admin", "必须保留至少一个启用的管理员")

    if payload.display_name is not None:
        target.display_name = payload.display_name.strip()[:80]
    if payload.role is not None:
        target.role = payload.role
    if payload.is_active is not None:
        target.is_active = payload.is_active
        if not payload.is_active:
            db.query(SessionRecord).filter(SessionRecord.user_id == target.id).delete()
    db.commit()
    audit(db, admin, "user.update", "user", str(target.id), payload.model_dump(exclude_none=True))
    return {"user": target.to_dict()}


@router.post("/{user_id}/reset-password")
def reset_password(
    user_id: int,
    payload: PasswordResetIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if target is None:
        raise api_error(404, "not_found", "用户不存在")
    target.password_hash = hash_password(payload.new_password)
    db.query(SessionRecord).filter(SessionRecord.user_id == target.id).delete()
    db.commit()
    audit(db, admin, "user.reset_password", "user", str(target.id))
    return {"ok": True, "message": "密码已重置，该用户需要重新登录"}


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if target is None:
        raise api_error(404, "not_found", "用户不存在")
    if target.id == admin.id:
        raise api_error(400, "cannot_delete_self", "不能删除当前登录账号")
    if target.role == "admin" and _active_admin_count(db) <= 1:
        raise api_error(400, "last_admin", "必须保留至少一个启用的管理员")
    db.query(SessionRecord).filter(SessionRecord.user_id == target.id).delete()
    db.query(AuditLog).filter(AuditLog.user_id == target.id).update({AuditLog.user_id: None})
    db.delete(target)
    db.commit()
    audit(db, admin, "user.delete", "user", str(user_id), {"username": target.username})
    return {"ok": True}
