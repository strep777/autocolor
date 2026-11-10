from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import api_error, get_current_user, optional_user, require_admin
from ..models import Product, User
from ..schemas import BulkIn, ImportIn, ProductIn, ProductUpdateIn
from ..services import importer as import_service
from ..services import products as product_service
from ..services.audit import audit

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/filters")
def filters(_: Optional[User] = Depends(optional_user), db: Session = Depends(get_db)):
    return product_service.distinct_values(db)


@router.get("/export")
def export_products(
    format: str = Query("json", pattern="^(json|csv)$"),
    q: str = "",
    status: str = "",
    material: str = "",
    shop: str = "",
    family: str = "",
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = product_service.apply_filters(
        db.query(Product), q=q, status=status, material=material, shop=shop, family=family
    )
    rows = query.all()
    if format == "csv":
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "title", "shop_name", "shop_url", "product_url", "external_id", "image_url",
                "price", "currency", "material", "width_cm", "weight_gsm", "description",
                "tags", "colors", "status",
            ]
        )
        for p in rows:
            writer.writerow(
                [
                    p.title, p.shop_name, p.shop_url, p.product_url, p.external_id, p.image_url,
                    (p.price_cents / 100) if p.price_cents is not None else "",
                    p.currency, p.material, p.width_cm or "", p.weight_gsm or "", p.description,
                    "|".join(p.tags),
                    "|".join(f"{c.name}:{c.hex}" for c in p.colors),
                    p.status,
                ]
            )
        content = "\ufeff" + buffer.getvalue()
        return Response(
            content=content,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="plushcolor-products.csv"'},
        )
    payload = json.dumps({"items": [p.to_dict() for p in rows]}, ensure_ascii=False, indent=2)
    return Response(
        content=payload,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="plushcolor-products.json"'},
    )


@router.get("/import/template")
def import_template(_: User = Depends(get_current_user)):
    sample_json = {
        "items": [
            {
                "title": "加厚珊瑚绒 奶油白",
                "shop_name": "海鲜毛布",
                "shop_url": "https://shop315729358.taobao.com/",
                "product_url": "https://item.taobao.com/item.htm?id=1",
                "external_id": "1",
                "image_url": "https://img.alicdn.com/example.jpg",
                "price": 39.9,
                "material": "珊瑚绒",
                "width_cm": 160,
                "weight_gsm": 320,
                "description": "加厚不掉毛",
                "tags": ["纯色", "加厚"],
                "colors": [
                    {"name": "奶油白", "hex": "#F3E9D2", "is_primary": True},
                    {"name": "雾霾蓝", "hex": "#9FB0BF"},
                ],
                "status": "active",
            }
        ]
    }
    sample_csv = (
        "title,shop_name,product_url,image_url,price,material,width_cm,weight_gsm,description,tags,colors\n"
        "加厚珊瑚绒 奶油白,海鲜毛布,https://item.taobao.com/item.htm?id=1,,39.9,珊瑚绒,160,320,加厚不掉毛,纯色|加厚,奶油白:#F3E9D2|雾霾蓝:#9FB0BF\n"
    )
    return {"json": json.dumps(sample_json, ensure_ascii=False, indent=2), "csv": sample_csv}


@router.post("/import")
def import_products(
    payload: ImportIn,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        result = import_service.import_products(
            db,
            payload.content,
            fmt=payload.format,
            mode=payload.mode,
            dry_run=payload.dry_run,
            user_id=admin.id,
        )
    except ValueError as exc:
        raise api_error(400, "import_failed", str(exc))
    if not payload.dry_run:
        audit(
            db,
            admin,
            "product.import",
            "product",
            "",
            {
                "created": result["created"],
                "updated": result["updated"],
                "errors": result["error_count"],
                "format": result["format"],
            },
            ip=request.client.host if request.client else "",
        )
    return result


@router.get("/sync/taobao/status")
def taobao_sync_status(_: User = Depends(require_admin)):
    path = get_settings().data_path / "import" / "taobao-sync.json"
    if not path.exists():
        return {"available": False, "count": 0, "shops": [], "updated_at": None, "file": str(path)}
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        raise api_error(400, "sync_file_invalid", "同步文件不是合法的 JSON")
    if isinstance(rows, dict):
        rows = rows.get("items") or rows.get("products") or []
    if not isinstance(rows, list):
        raise api_error(400, "sync_file_invalid", "同步文件格式不正确")
    shops = sorted({str(row.get("shop_name")) for row in rows if isinstance(row, dict) and row.get("shop_name")})
    return {
        "available": True,
        "count": len(rows),
        "shops": shops,
        "updated_at": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
        "file": str(path),
    }


@router.post("/sync/taobao/import")
def taobao_sync_import(
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    path = get_settings().data_path / "import" / "taobao-sync.json"
    if not path.exists():
        raise api_error(404, "sync_file_missing", "还没有同步文件，请先运行 tools/taobao-sync.mjs")
    content = path.read_text(encoding="utf-8")
    try:
        result = import_service.import_products(db, content, fmt="json", mode="merge", dry_run=False, user_id=admin.id)
    except ValueError as exc:
        raise api_error(400, "import_failed", str(exc))
    audit(
        db,
        admin,
        "product.sync_taobao",
        "product",
        "",
        {"created": result["created"], "updated": result["updated"], "errors": result["error_count"]},
        ip=request.client.host if request.client else "",
    )
    return result


@router.post("/bulk")
def bulk(
    payload: BulkIn,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ids = product_service.filter_ids(db, payload.filters, payload.ids, payload.all)
    ids = list(dict.fromkeys(ids))
    if not ids:
        raise api_error(400, "empty_selection", "没有选中任何商品")
    rows = db.query(Product).filter(Product.id.in_(ids)).all()
    affected = 0
    for product in rows:
        if payload.action == "activate":
            product.status = "active"
        elif payload.action == "deactivate":
            product.status = "draft"
        elif payload.action == "archive":
            product.status = "archived"
        elif payload.action == "delete":
            db.delete(product)
        affected += 1
    db.commit()
    audit(
        db,
        admin,
        f"product.bulk_{payload.action}",
        "product",
        "",
        {"requested": ids, "affected": affected},
        ip=request.client.host if request.client else "",
    )
    labels = {"activate": "上架", "deactivate": "下架", "archive": "归档", "delete": "删除"}
    return {"ok": True, "affected": affected, "message": f"已{labels[payload.action]} {affected} 个商品"}


@router.get("")
def list_products(
    q: str = "",
    status: str = "",
    material: str = "",
    shop: str = "",
    family: str = "",
    sort: str = "created_desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: Optional[User] = Depends(optional_user),
    db: Session = Depends(get_db),
):
    query = product_service.apply_filters(
        db.query(Product), q=q, status=status, material=material, shop=shop, family=family, sort=sort
    )
    return product_service.paginate(db, query, page, page_size)


@router.post("")
def create_product(
    payload: ProductIn,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = product_service.create_product(db, payload, admin.id, source="manual")
    db.commit()
    db.refresh(product)
    audit(db, admin, "product.create", "product", str(product.id), {"title": product.title})
    return {"product": product.to_dict()}


@router.get("/{product_id}")
def get_product(
    product_id: int,
    _: Optional[User] = Depends(optional_user),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if product is None:
        raise api_error(404, "not_found", "商品不存在")
    return {"product": product.to_dict()}


@router.put("/{product_id}")
def update_product(
    product_id: int,
    payload: ProductUpdateIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if product is None:
        raise api_error(404, "not_found", "商品不存在")
    product_service.update_product(db, product, payload)
    db.commit()
    db.refresh(product)
    audit(db, admin, "product.update", "product", str(product.id), {"title": product.title})
    return {"product": product.to_dict()}


@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if product is None:
        raise api_error(404, "not_found", "商品不存在")
    title = product.title
    db.delete(product)
    db.commit()
    audit(db, admin, "product.delete", "product", str(product_id), {"title": title})
    return {"ok": True}
