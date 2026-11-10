from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import optional_user
from ..models import Product, ProductColor, User
from ..services import color as color_service

router = APIRouter(prefix="/colors", tags=["colors"])

FAMILY_ORDER = ["白", "米", "灰", "黑", "棕", "红", "橙", "黄", "绿", "青", "蓝", "紫", "粉"]


def _hex_query(value: str) -> str:
    token = (value or "").strip().lstrip("#")
    if re.fullmatch(r"[0-9a-fA-F]{3}", token):
        token = "".join(ch * 2 for ch in token)
    if re.fullmatch(r"[0-9a-fA-F]{6}", token):
        return "#" + token.upper()
    return ""


def _build_shop_colors(rows: List[ProductColor]) -> List[Dict[str, Any]]:
    """同一店铺内按色名去重，再按色值兜底去重；不同店铺互不影响。

    同名颜色可能因为拍摄/取样出现几个相近 HEX，取中位明度的实际样本；
    同店同 HEX 但名称写法不同（如“炭黑/碳黑”）只保留一个更短的名字。
    """
    by_name: Dict[tuple, List[ProductColor]] = {}
    for row in rows:
        shop = (row.product.shop_name if row.product else "") or ""
        by_name.setdefault((shop, (row.name or "").strip().lower()), []).append(row)

    merged: Dict[tuple, Dict[str, Any]] = {}
    for group_rows in by_name.values():
        ordered = sorted(group_rows, key=lambda r: r.lab_l or 0)
        rep = ordered[len(ordered) // 2]
        shop = (rep.product.shop_name if rep.product else "") or ""
        key = (shop, rep.hex)
        target = merged.get(key)
        if target is None:
            merged[key] = {"rep": rep, "rows": list(group_rows)}
        else:
            target["rows"].extend(group_rows)
            if len(rep.name or "") < len(target["rep"].name or ""):
                target["rep"] = rep

    groups: List[Dict[str, Any]] = []
    for (shop_name, hex_value), data in merged.items():
        rep: ProductColor = data["rep"]
        product = rep.product
        group_rows: List[ProductColor] = data["rows"]
        groups.append(
            {
                "hex": hex_value,
                "name": rep.name,
                "family": rep.family,
                "shop_name": shop_name,
                "count": len({r.product_id for r in group_rows}),
                "lab": {
                    "l": round(rep.lab_l or 0, 2),
                    "a": round(rep.lab_a or 0, 2),
                    "b": round(rep.lab_b or 0, 2),
                },
                "text_color": color_service.best_text_color(
                    *color_service.hex_to_rgb(hex_value)
                ),
                "sample": {
                    "id": product.id if product else None,
                    "title": product.title if product else "",
                    "image_url": product.image_url if product else "",
                    "price_cents": product.price_cents if product else None,
                    "shop_name": shop_name,
                    "shop_url": product.shop_url if product else "",
                    "product_url": product.product_url if product else "",
                },
            }
        )
    return groups


@router.get("")
def list_colors(
    family: str = "",
    q: str = "",
    sort: str = "shop",
    page: int = Query(1, ge=1),
    page_size: int = Query(60, ge=1, le=200),
    _: Optional[User] = Depends(optional_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(ProductColor)
        .join(Product, Product.id == ProductColor.product_id)
        .filter(Product.status == "active")
    )
    if family:
        query = query.filter(ProductColor.family == family)
    items = _build_shop_colors(query.all())

    hex_query = _hex_query(q)
    if hex_query:
        target_lab = color_service.hex_to_lab(hex_query)
        for item in items:
            distance = color_service.delta_e_2000(
                target_lab,
                (item["lab"]["l"], item["lab"]["a"], item["lab"]["b"]),
            )
            item["distance"] = round(distance, 2)
            item["match_level"] = color_service.match_level(distance)
        items.sort(key=lambda c: (c["distance"], c["shop_name"], c["hex"]))
    elif q:
        needle = q.strip().lower()
        items = [
            c
            for c in items
            if needle in c["hex"].lower()
            or needle in (c["name"] or "").lower()
            or needle in (c["shop_name"] or "").lower()
            or needle in c["family"]
        ]
        if sort == "code":
            items.sort(key=lambda c: ((c["name"] or "").lower(), c["hex"], c["shop_name"]))
        else:
            items.sort(key=lambda c: (c["shop_name"], (c["name"] or "").lower(), c["hex"]))
    elif sort == "code":
        items.sort(key=lambda c: ((c["name"] or "").lower(), c["hex"], c["shop_name"]))
    else:
        items.sort(key=lambda c: (c["shop_name"], (c["name"] or "").lower(), c["hex"]))

    total = len(items)
    start = (page - 1) * page_size
    return {
        "items": items[start : start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if total else 0,
    }


@router.get("/families")
def families(_: Optional[User] = Depends(optional_user), db: Session = Depends(get_db)):
    rows = (
        db.query(ProductColor)
        .join(Product, Product.id == ProductColor.product_id)
        .filter(Product.status == "active")
        .all()
    )
    counter: Dict[str, int] = {}
    for color in _build_shop_colors(rows):
        family = color["family"]
        if family:
            counter[family] = counter.get(family, 0) + 1
    items = [{"family": f, "count": counter[f]} for f in FAMILY_ORDER if f in counter]
    items.sort(key=lambda x: -x["count"])
    return {"items": items, "total": sum(i["count"] for i in items)}
