from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Product, ProductColor, RecommendationLog, utcnow
from ..services import products as product_service

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("")
def stats(db: Session = Depends(get_db)):
    status_rows = db.query(Product.status, func.count(Product.id)).group_by(Product.status).all()
    by_status = {status: count for status, count in status_rows}
    total_products = db.query(func.count(Product.id)).scalar() or 0
    total_colors = db.query(func.count(ProductColor.id)).scalar() or 0
    distinct_colors = db.query(func.count(func.distinct(ProductColor.hex))).scalar() or 0
    shops = db.query(func.count(func.distinct(Product.shop_name))).filter(Product.shop_name != "").scalar() or 0

    since = utcnow() - timedelta(days=7)
    recommendations_7d = (
        db.query(func.count(RecommendationLog.id)).filter(RecommendationLog.created_at >= since).scalar() or 0
    )
    ai_7d = (
        db.query(func.count(RecommendationLog.id))
        .filter(RecommendationLog.created_at >= since, RecommendationLog.mode == "ai")
        .scalar()
        or 0
    )

    shop_rows = (
        db.query(Product.shop_name, func.count(Product.id))
        .filter(Product.shop_name != "")
        .group_by(Product.shop_name)
        .order_by(func.count(Product.id).desc())
        .all()
    )
    recent = db.query(Product).order_by(Product.created_at.desc()).limit(6).all()

    daily: List[Dict[str, Any]] = []
    for offset in range(6, -1, -1):
        day_start = (utcnow() - timedelta(days=offset)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = (
            db.query(func.count(RecommendationLog.id))
            .filter(RecommendationLog.created_at >= day_start, RecommendationLog.created_at < day_end)
            .scalar()
            or 0
        )
        daily.append({"date": day_start.strftime("%m-%d"), "count": count})

    return {
        "products": {
            "total": total_products,
            "active": by_status.get("active", 0),
            "draft": by_status.get("draft", 0),
            "archived": by_status.get("archived", 0),
        },
        "colors": {"total": total_colors, "distinct": distinct_colors},
        "shops": shops,
        "recommendations": {"last_7d": recommendations_7d, "ai_last_7d": ai_7d},
        "families": product_service.family_distribution(db),
        "shop_distribution": [{"shop": shop, "count": count} for shop, count in shop_rows],
        "recent_products": [p.to_dict() for p in recent],
        "daily": daily,
    }
