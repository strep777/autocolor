from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session, joinedload

from ..models import Product, ProductColor, RecommendationLog, User, utcnow
from ..schemas import RecommendIn
from . import ai as ai_service
from . import color as color_service

LOCAL_CAUTION = "色差受光线与屏幕影响，批量下单前请以实物色卡确认。"


def _reason_for(distance: float, family: str) -> str:
    if distance <= 1.5:
        return f"ΔE {distance:.1f}，几乎同色，可直接打样"
    if distance <= 3.5:
        return f"ΔE {distance:.1f}，验收范围内，建议对色卡"
    if distance <= 12:
        return f"ΔE {distance:.1f}，同一色感（{family}），适合做主色替代"
    return f"ΔE {distance:.1f}，氛围接近，适合做辅色或撞色"


def _collect_candidates(db: Session, target_lab, material: str, limit: int, only_close: bool):
    query = (
        db.query(ProductColor)
        .options(joinedload(ProductColor.product))
        .join(Product, Product.id == ProductColor.product_id)
        .filter(Product.status == "active")
    )
    if material:
        query = query.filter(Product.material == material)
    rows = query.all()

    candidates: List[Dict[str, Any]] = []
    for color in rows:
        product = color.product
        if product is None:
            continue
        distance = color_service.delta_e_2000(target_lab, (color.lab_l, color.lab_a, color.lab_b))
        if only_close and distance > 3.5:
            continue
        candidates.append(
            {
                "id": color.id,
                "product_id": product.id,
                "title": product.title,
                "display_name": "【{shop}-{material}-{pile}-{color}】".format(
                    shop=product.shop_name or "未标注店铺",
                    material=product.material or "毛布",
                    pile=product.pile_length or "未标注",
                    color=color.name or color.hex,
                ),
                "material": product.material,
                "pile_length": product.pile_length,
                "hex": color.hex,
                "name": color.name,
                "family": color.family,
                "delta_e": round(distance, 2),
                "score": color_service.similarity_score(distance),
                "price_cents": product.price_cents,
                "image_url": product.image_url,
                "shop_name": product.shop_name,
                "shop_url": product.shop_url,
                "product_url": product.product_url,
                "status": product.status,
                "is_primary": color.is_primary,
                "product": product,
            }
        )
    candidates.sort(key=lambda c: c["delta_e"])
    # 同一商品只保留最接近的那个色号，避免推荐列表里同款重复出现
    deduped: List[Dict[str, Any]] = []
    seen_products = set()
    for candidate in candidates:
        if candidate["product_id"] in seen_products:
            continue
        seen_products.add(candidate["product_id"])
        deduped.append(candidate)
    # 每个有在售商品的店铺先保留一个最近色号，再按色差补足候选池。
    # 这样不会因为某个店铺整体色差略远而从找色结果里消失。
    per_shop: Dict[str, Dict[str, Any]] = {}
    for candidate in deduped:
        shop = candidate["shop_name"] or ""
        per_shop.setdefault(shop, candidate)
    quota = max(limit * 3, 12)
    selected: List[Dict[str, Any]] = []
    selected_ids = set()
    for shop, candidate in per_shop.items():
        selected.append(candidate)
        selected_ids.add(candidate["id"])
    cap = max(quota, len(per_shop))
    for candidate in deduped:
        if len(selected) >= cap:
            break
        if candidate["id"] in selected_ids:
            continue
        selected.append(candidate)
        selected_ids.add(candidate["id"])
    selected.sort(key=lambda c: c["delta_e"])
    return selected


def _weighted_score(item: Dict[str, Any]) -> float:
    ai_score = item.get("ai_score")
    return item["score"] * 0.7 + (ai_score if ai_score is not None else item["score"]) * 0.3


def _ensure_shop_coverage(
    items: List[Dict[str, Any]],
    candidates: List[Dict[str, Any]],
    limit: int,
) -> List[Dict[str, Any]]:
    """保证每个有在售商品的店铺至少出现在结果中一次。"""
    per_shop: Dict[str, Dict[str, Any]] = {}
    for candidate in candidates:
        per_shop.setdefault(candidate["shop_name"] or "", candidate)
    target = min(24, max(limit, len(per_shop)))
    picked: List[Dict[str, Any]] = []
    seen_shops = set()
    picked_ids = set()
    for item in items:
        shop = item["shop_name"] or ""
        if shop in seen_shops:
            continue
        picked.append(item)
        seen_shops.add(shop)
        picked_ids.add(item["color_id"])
        if len(picked) >= target:
            break
    for shop, candidate in per_shop.items():
        if shop in seen_shops:
            continue
        picked.append(
            _item_from_candidate(
                candidate,
                _reason_for(candidate["delta_e"], candidate["family"]),
            )
        )
        seen_shops.add(shop)
        picked_ids.add(candidate["id"])
    for item in items:
        if len(picked) >= target:
            break
        if item["color_id"] in picked_ids:
            continue
        picked.append(item)
        picked_ids.add(item["color_id"])
    picked.sort(key=_weighted_score, reverse=True)
    return picked


def _item_from_candidate(c: Dict[str, Any], reason: str, ai_score: Optional[float] = None) -> Dict[str, Any]:
    product = c["product"]
    return {
        "color_id": c["id"],
        "product_id": c["product_id"],
        "title": c["title"],
        "display_name": c["display_name"],
        "material": c["material"],
        "pile_length": c["pile_length"],
        "shop_name": c["shop_name"],
        "shop_url": c["shop_url"],
        "product_url": c["product_url"],
        "image_url": c["image_url"],
        "price_cents": c["price_cents"],
        "color": {
            "name": c["name"],
            "hex": c["hex"],
            "family": c["family"],
            "is_primary": c["is_primary"],
        },
        "delta_e": c["delta_e"],
        "score": c["score"],
        "ai_score": ai_score,
        "level": color_service.match_level(c["delta_e"]),
        "reason": reason,
        "product_status": product.status if product else "active",
    }


def _local_summary(target_hex: str, family: str, items: List[Dict[str, Any]], total: int) -> str:
    if not items:
        return f"目标色 {target_hex}（{family}）暂未找到在售色号，试试放宽材质或导入更多商品。"
    best = items[0]
    return (
        f"目标色 {target_hex}（{family}）从 {total} 个候选色号中匹配到 {len(items)} 件商品，"
        f"最接近「{best['title']} · {best['color']['name']}」，ΔE {best['delta_e']}。"
    )


def recommend(db: Session, user: Optional[User], payload: RecommendIn) -> Dict[str, Any]:
    started = time.perf_counter()
    info = color_service.describe(payload.hex)
    target_lab = (info.l, info.a, info.bb)
    candidates = _collect_candidates(db, target_lab, payload.material.strip(), payload.limit, payload.only_close)

    active_provider = ""
    ai_error = ""
    summary = ""
    advice = ""
    caution = LOCAL_CAUTION
    ordered: List[Dict[str, Any]] = []

    if payload.mode == "ai" and candidates:
        try:
            query = {
                "hex": info.hex,
                "lab": {"l": round(info.l, 2), "a": round(info.a, 2), "b": round(info.bb, 2)},
                "family": info.family,
                "material": payload.material.strip(),
                "scene": payload.scene.strip(),
            }
            ai_candidates = candidates[:12]
            result, active_provider, _ai_ms = ai_service.rank_candidates(
                db,
                payload.provider,
                query,
                [
                    {
                        "id": c["id"],
                        "title": c["title"],
                        "material": c["material"],
                        "hex": c["hex"],
                        "delta_e": c["delta_e"],
                        "score": c["score"],
                        "family": c["family"],
                        "price_cents": c["price_cents"],
                    }
                    for c in ai_candidates
                ],
                payload.limit,
            )
            by_id = {c["id"]: c for c in candidates}
            for entry in result["ranking"]:
                c = by_id.get(entry["id"])
                if c is None:
                    continue
                ordered.append(_item_from_candidate(c, entry["reason"], ai_score=entry["score"]))
            # AI 少排的，用本地结果补齐，保证可用性
            for c in candidates:
                if len(ordered) >= payload.limit:
                    break
                if any(item["color_id"] == c["id"] for item in ordered):
                    continue
                ordered.append(_item_from_candidate(c, _reason_for(c["delta_e"], c["family"])))
            # 小模型可能给出与色差矛盾的顺序：用本地相似度做硬约束，AI 分数只做加权微调。
            ordered.sort(
                key=lambda item: item["score"] * 0.7
                + (item["ai_score"] if item.get("ai_score") is not None else item["score"]) * 0.3,
                reverse=True,
            )
            summary = result["summary"] or _local_summary(info.hex, info.family, ordered, len(candidates))
            advice = result["advice"]
            caution = result["caution"] or LOCAL_CAUTION
        except ai_service.AIError as exc:
            ai_error = exc.message
            active_provider = ""
    if not ordered:
        for c in candidates:
            if len(ordered) >= payload.limit:
                break
            ordered.append(_item_from_candidate(c, _reason_for(c["delta_e"], c["family"])))
        if not summary:
            summary = _local_summary(info.hex, info.family, ordered, len(candidates))
        if not advice:
            advice = "优先看 ΔE ≤ 3.5 的色号；需要撞色时再从 6–12 的相近色里挑辅色。"
        if not active_provider:
            active_provider = "local"

    ordered = _ensure_shop_coverage(ordered, candidates, payload.limit)

    mode = "ai" if (payload.mode == "ai" and active_provider not in {"", "local"}) else "local"
    if payload.mode == "ai" and ai_error:
        mode = "local_fallback"

    elapsed = int((time.perf_counter() - started) * 1000)

    log_items = [
        {
            "product_id": item["product_id"],
            "color_id": item["color_id"],
            "hex": item["color"]["hex"],
            "delta_e": item["delta_e"],
            "score": item["score"],
            "reason": item["reason"],
        }
        for item in ordered
    ]
    log = RecommendationLog(
        user_id=user.id if user else None,
        hex=info.hex,
        mode=mode,
        provider=active_provider if mode == "ai" else "",
        items_json=json.dumps(log_items, ensure_ascii=False),
        summary=summary[:500],
        elapsed_ms=elapsed,
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    return {
        "hex": info.hex,
        "target": info.to_dict(),
        "mode": mode,
        "provider": active_provider,
        "ai_error": ai_error,
        "summary": summary,
        "advice": advice,
        "caution": caution,
        "items": ordered,
        "elapsed_ms": elapsed,
        "log_id": log.id,
    }


def history(db: Session, user: User, limit: int = 20, full: bool = False) -> List[Dict[str, Any]]:
    query = db.query(RecommendationLog)
    if user.role != "admin":
        query = query.filter(RecommendationLog.user_id == user.id)
    rows = query.order_by(RecommendationLog.created_at.desc()).limit(max(1, min(100, limit))).all()
    return [r.to_dict(full=full) for r in rows]


def feedback(db: Session, user: User, log_id: int, value: int) -> Dict[str, Any]:
    log = db.get(RecommendationLog, log_id)
    if log is None:
        raise ValueError("记录不存在")
    if log.user_id not in (None, user.id) and user.role != "admin":
        raise PermissionError("无权评价该记录")
    log.feedback = value
    db.commit()
    return {"id": log.id, "feedback": log.feedback}


def stats_since(db: Session, days: int = 7) -> Dict[str, Any]:
    from datetime import datetime, timedelta

    since = utcnow() - timedelta(days=days)
    total = db.query(RecommendationLog).filter(RecommendationLog.created_at >= since).count()
    ai_count = (
        db.query(RecommendationLog)
        .filter(RecommendationLog.created_at >= since, RecommendationLog.mode == "ai")
        .count()
    )
    return {"recommendations_7d": total, "ai_recommendations_7d": ai_count}
