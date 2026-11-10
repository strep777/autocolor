from __future__ import annotations

import csv
import io
import json
import re
from typing import Any, Dict, List, Optional, Tuple

from pydantic import ValidationError
from sqlalchemy.orm import Session

from ..models import Product
from ..schemas import ColorIn, ProductIn, ProductUpdateIn
from . import products as product_service

MAX_ROWS = 2000

HEADER_ALIASES = {
    "title": "title", "标题": "title", "商品标题": "title", "商品名称": "title",
    "shop_name": "shop_name", "店铺": "shop_name", "店铺名": "shop_name",
    "shop_url": "shop_url", "店铺链接": "shop_url",
    "product_url": "product_url", "商品链接": "product_url", "链接": "product_url",
    "external_id": "external_id", "商品ID": "external_id", "id": "external_id",
    "image_url": "image_url", "图片": "image_url", "主图": "image_url",
    "price": "price", "价格": "price", "售价": "price",
    "price_cents": "price_cents",
    "currency": "currency", "币种": "currency",
    "material": "material", "材质": "material", "面料": "material", "毛布类型": "material",
    "pile_length": "pile_length", "毛长": "pile_length", "毛高": "pile_length", "长度": "pile_length",
    "width_cm": "width_cm", "幅宽": "width_cm", "门幅": "width_cm",
    "weight_gsm": "weight_gsm", "克重": "weight_gsm",
    "description": "description", "描述": "description", "备注": "description",
    "tags": "tags", "标签": "tags",
    "colors": "colors", "色号": "colors", "颜色": "colors",
    "status": "status", "状态": "status",
}


def _split_tags(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    if not value:
        return []
    text = str(value)
    for sep in ("|", "、", ";", "；"):
        text = text.replace(sep, ",")
    return [t.strip() for t in text.split(",") if t.strip()]


def _parse_colors(value: Any) -> List[ColorIn]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        out = []
        for item in value:
            if isinstance(item, str):
                out.append(item)
            elif isinstance(item, dict):
                out.append(ColorIn(**item))
        if out and isinstance(out[0], str):
            return _parse_colors("|".join(out))
        return out
    text = str(value)
    colors: List[ColorIn] = []
    for part in text.replace("；", "|").replace(";", "|").split("|"):
        part = part.strip()
        if not part:
            continue
        if ":" in part or "：" in part:
            name, _, hex_value = part.replace("：", ":").partition(":")
            colors.append(ColorIn(name=name.strip(), hex=hex_value.strip()))
        else:
            colors.append(ColorIn(name="", hex=part))
    return colors


def _parse_price(row: Dict[str, Any]) -> Optional[int]:
    if row.get("price_cents") not in (None, ""):
        try:
            return int(float(row["price_cents"]))
        except (TypeError, ValueError):
            return None
    if row.get("price") not in (None, ""):
        try:
            return int(round(float(str(row["price"]).replace("¥", "").replace("￥", "").strip()) * 100))
        except (TypeError, ValueError):
            return None
    return None


def parse_json_content(content: str) -> List[Dict[str, Any]]:
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON 解析失败：{exc.msg} (行 {exc.lineno})")
    if isinstance(data, dict):
        data = data.get("items", data.get("products", []))
    if not isinstance(data, list):
        raise ValueError("JSON 顶层必须是数组，或包含 items 数组的对象")
    return data


def parse_csv_content(content: str) -> List[Dict[str, Any]]:
    text = content.lstrip("\ufeff")
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    rows: List[Dict[str, Any]] = []
    for raw in reader:
        mapped: Dict[str, Any] = {}
        for key, value in raw.items():
            if key is None:
                continue
            clean = str(key).strip()
            mapped[HEADER_ALIASES.get(clean, HEADER_ALIASES.get(clean.lower(), clean))] = value
        rows.append(mapped)
    return rows


def parse_content(content: str, fmt: str) -> Tuple[List[Dict[str, Any]], str]:
    looks_json = content.lstrip().startswith(("[", "{"))
    if fmt == "json" or (fmt == "auto" and looks_json):
        return parse_json_content(content), "json"
    return parse_csv_content(content), "csv"


def _normalize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(row, dict):
        raise ValueError("每行必须是一个对象")
    normalized: Dict[str, Any] = {}
    for key, value in row.items():
        normalized[HEADER_ALIASES.get(str(key).strip(), HEADER_ALIASES.get(str(key).strip().lower(), str(key).strip()))] = value

    result: Dict[str, Any] = {
        "title": str(normalized.get("title") or "").strip(),
        "shop_name": str(normalized.get("shop_name") or "").strip(),
        "shop_url": str(normalized.get("shop_url") or "").strip(),
        "product_url": str(normalized.get("product_url") or "").strip(),
        "external_id": str(normalized.get("external_id") or "").strip(),
        "image_url": str(normalized.get("image_url") or "").strip(),
        "currency": str(normalized.get("currency") or "CNY").strip() or "CNY",
        "material": str(normalized.get("material") or "").strip(),
        "pile_length": str(normalized.get("pile_length") or "").strip(),
        "description": str(normalized.get("description") or "").strip(),
        "tags": _split_tags(normalized.get("tags")),
        "colors": _parse_colors(normalized.get("colors")),
        "status": str(normalized.get("status") or "active").strip() or "active",
        "price_cents": _parse_price(normalized),
    }
    if not result["pile_length"]:
        match = re.search(r"(\d+(?:\.\d+)?\s*(?:cm|mm|厘米|毫米))", result["title"], re.I)
        if match:
            result["pile_length"] = match.group(1).replace(" ", "")
    for key in ("width_cm", "weight_gsm"):
        value = normalized.get(key)
        if value not in (None, ""):
            try:
                result[key] = int(float(value))
            except (TypeError, ValueError):
                result[key] = None
        else:
            result[key] = None
    if any(c.is_primary for c in result["colors"]) is False and result["colors"]:
        result["colors"][0] = ColorIn(name=result["colors"][0].name, hex=result["colors"][0].hex, is_primary=True)
    return result


def _find_existing(db: Session, payload: ProductIn) -> Optional[Product]:
    if payload.external_id:
        found = db.query(Product).filter(Product.external_id == payload.external_id).first()
        if found:
            return found
    return (
        db.query(Product)
        .filter(Product.title == payload.title.strip(), Product.shop_name == payload.shop_name.strip())
        .first()
    )


def import_products(
    db: Session,
    content: str,
    fmt: str = "auto",
    mode: str = "merge",
    dry_run: bool = False,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    rows, used_format = parse_content(content, fmt)
    if len(rows) > MAX_ROWS:
        raise ValueError(f"单次最多导入 {MAX_ROWS} 条，当前 {len(rows)} 条")
    errors: List[Dict[str, Any]] = []
    preview: List[Dict[str, Any]] = []
    created = 0
    updated = 0
    skipped = 0

    seen_external: set = set()

    for index, raw in enumerate(rows, start=1):
        try:
            data = _normalize_row(raw)
            if not data["title"]:
                raise ValueError("缺少商品标题 (title)")
            if data["external_id"]:
                if data["external_id"] in seen_external:
                    raise ValueError(f"文件内商品 ID 重复：{data['external_id']}")
                seen_external.add(data["external_id"])
            payload = ProductIn(**data)
        except ValidationError as exc:
            first = exc.errors()[0]
            message = f"{'.'.join(str(x) for x in first.get('loc', []))}: {first.get('msg', '校验失败')}"
            errors.append({"row": index, "message": message})
            continue
        except (ValueError, TypeError) as exc:
            errors.append({"row": index, "message": str(exc)})
            continue

        existing = _find_existing(db, payload)
        if existing and mode == "merge":
            action = "update"
        elif existing and mode == "append":
            action = "skip"
        else:
            action = "create"

        preview.append(
            {
                "row": index,
                "title": payload.title,
                "shop_name": payload.shop_name,
                "price_cents": payload.price_cents,
                "material": payload.material,
                "colors": [{"name": c.name, "hex": c.hex} for c in payload.colors],
                "status": payload.status,
                "action": action,
            }
        )
        if dry_run:
            if action == "update":
                updated += 1
            elif action == "skip":
                skipped += 1
            else:
                created += 1
            continue

        try:
            if action == "update":
                update_payload = ProductUpdateIn(**payload.model_dump())
                product_service.update_product(db, existing, update_payload)
                updated += 1
            elif action == "skip":
                skipped += 1
            else:
                product_service.create_product(db, payload, user_id, source="import")
                created += 1
            db.commit()
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            errors.append({"row": index, "message": f"写入失败：{exc}"})

    return {
        "format": used_format,
        "dry_run": dry_run,
        "total_rows": len(rows),
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:100],
        "error_count": len(errors),
        "preview": preview[:20],
    }
