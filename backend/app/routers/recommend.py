from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import api_error, get_current_user, optional_user
from ..models import User
from ..schemas import FeedbackIn, RecommendIn
from ..services import recommend as recommend_service

router = APIRouter(prefix="/recommend", tags=["recommend"])


@router.post("")
def recommend(
    payload: RecommendIn,
    user: Optional[User] = Depends(optional_user),
    db: Session = Depends(get_db),
):
    return recommend_service.recommend(db, user, payload)


@router.get("/history")
def history(
    limit: int = Query(20, ge=1, le=100),
    full: bool = False,
    user: Optional[User] = Depends(optional_user),
    db: Session = Depends(get_db),
):
    if user is None:
        return {"items": []}
    return {"items": recommend_service.history(db, user, limit=limit, full=full)}


@router.post("/{log_id}/feedback")
def feedback(
    log_id: int,
    payload: FeedbackIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return recommend_service.feedback(db, user, log_id, payload.value)
    except ValueError as exc:
        raise api_error(404, "not_found", str(exc))
    except PermissionError as exc:
        raise api_error(403, "forbidden", str(exc))
