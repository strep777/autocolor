from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy import func, or_
from sqlalchemy.orm import Query, Session

from ..models import Product, ProductColor, utcnow
from ..schemas import ColorIn, ProductIn, ProductUpdateIn
from . import color as color_service


def apply_filters(
    query: Query,
    q: str = "",
    status: str = "",
    material: str = "",
    shop: str = "",
    family: str = "",
    sort: str = "created_desc",
) -> Query:
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Product.title.ilike(like),
                Product.description.ilike(like),
                Product.shop_name.ilike(like),
                Product.material.ilike(like),
                Product.colors.any(ProductColor.name.ilike(like)),
            )
        )
    if status:
        query = query.filter(Product.status == status)
    if material:
        query = query.filter(Product.material == material)
    if shop:
        query = query.filter(Product.shop_name == shop)
    if family:
        query = query.filter(Product.colors.any(ProductColor.family == family))

    if sort == "price_asc":
        query = query.order_by(Product.price_cents.is_(None), Product.price_cents.asc(), Product.id.desc())
    elif sort == "price_desc":
        query = query.order_by(Product.price_cents.is_(None), Product.price_cents.desc(), Product.id.desc())
    elif sort == "title":
        query = query.order_by(Product.title.asc())
    elif sort == "updated_desc":
        query = query.order_by(Product.updated_at.desc())
    else:
        query = query.order_by(Product.created_at.desc(), Product.id.desc())
    return query


def paginate(db: Session, query: Query, page: int, page_size: int) -> Dict[str, Any]:
    total = query.order_by(None).count()
    page = max(1, page)
    page_size = max(1, min(100, page_size))
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    pages = (total + page_size - 1) // page_size if total else 0
    return {
        "items": [p.to_dict() for p in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
    }


def _build_color(payload: ColorIn, index: int) -> ProductColor:
    info = color_service.describe(payload.hex)
    return ProductColor(
        name=payload.name.strip(),
        hex=info.hex,
        lab_l=round(info.l, 4),
        lab_a=round(info.a, 4),
        lab_b=round(info.bb, 4),
        family=info.family,
        is_primary=False,
    )


def normalize_colors(items: Sequence[ColorIn]) -> List[ProductColor]:
    colors = [_build_color(c, i) for i, c in enumerate(items)]
    if not colors:
        return colors
    primary_index = next((i for i, c in enumerate(items) if c.is_primary), 0)
    colors[primary_index].is_primary = True
    return colors


def create_product(db: Session, payload: ProductIn, user_id: Optional[int], source: str = "manual") -> Product:
    product = Product(
        title=payload.title.strip(),
        shop_name=payload.shop_name.strip(),
        shop_url=payload.shop_url.strip(),
        product_url=payload.product_url.strip(),
        external_id=payload.external_id.strip(),
        image_url=payload.image_url.strip(),
        price_cents=payload.price_cents,
        currency=payload.currency or "CNY",
        material=payload.material.strip(),
        pile_length=payload.pile_length.strip(),
        width_cm=payload.width_cm,
        weight_gsm=payload.weight_gsm,
        description=payload.description.strip(),
        status=payload.status,
        source=source,
        created_by=user_id,
    )
    product.tags = payload.tags
    product.colors = normalize_colors(payload.colors)
    db.add(product)
    db.flush()
    return product


def update_product(db: Session, product: Product, payload: ProductUpdateIn, replace_colors: bool = True) -> Product:
    data = payload.model_dump(exclude_unset=True)
    colors = data.pop("colors", None)
    tags = data.pop("tags", None)
    for key, value in data.items():
        if key in {"title", "shop_name", "shop_url", "product_url", "external_id", "image_url", "material", "pile_length", "description"}:
            value = (value or "").strip()
        setattr(product, key, value)
    if tags is not None:
        product.tags = [str(t).strip()[:30] for t in tags if str(t).strip()][:20]
    if replace_colors and colors is not None:
        parsed = [ColorIn(**c) for c in colors]
        product.colors.clear()
        db.flush()
        product.colors = normalize_colors(parsed)
    product.updated_at = utcnow()
    db.flush()
    return product


def filter_ids(db: Session, filters: Dict[str, Any], ids: List[int], all_flag: bool) -> List[int]:
    if not all_flag:
        return ids
    query = db.query(Product.id)
    query = apply_filters(
        query,
        q=str(filters.get("q", "") or ""),
        status=str(filters.get("status", "") or ""),
        material=str(filters.get("material", "") or ""),
        shop=str(filters.get("shop", "") or ""),
        family=str(filters.get("family", "") or ""),
        sort="created_desc",
    )
    return [row[0] for row in query.all()]


def distinct_values(db: Session) -> Dict[str, List[str]]:
    materials = [r[0] for r in db.query(Product.material).filter(Product.material != "").distinct().order_by(Product.material).all()]
    shops = [r[0] for r in db.query(Product.shop_name).filter(Product.shop_name != "").distinct().order_by(Product.shop_name).all()]
    families = [
        r[0]
        for r in db.query(ProductColor.family).filter(ProductColor.family != "").distinct().order_by(ProductColor.family).all()
    ]
    return {"materials": materials, "shops": shops, "families": families}


def family_distribution(db: Session) -> List[Dict[str, Any]]:
    rows = (
        db.query(ProductColor.family, func.count(ProductColor.id))
        .group_by(ProductColor.family)
        .order_by(func.count(ProductColor.id).desc())
        .all()
    )
    return [{"family": r[0], "count": r[1]} for r in rows if r[0]]
