from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    """UTC 朴素时间；SQLite 不保存时区，统一按 UTC 解释。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name or self.username,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
            "last_login_at": self.last_login_at.isoformat() + "Z" if self.last_login_at else None,
        }


class SessionRecord(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    user_agent: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    user: Mapped["User"] = relationship("User", lazy="joined")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    shop_name: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    shop_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    product_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    external_id: Mapped[str] = mapped_column(String(64), default="", index=True, nullable=False)
    image_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    price_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="CNY", nullable=False)
    material: Mapped[str] = mapped_column(String(40), default="", index=True, nullable=False)
    pile_length: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    width_cm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    weight_gsm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    tags_json: Mapped[str] = mapped_column("tags", Text, default="[]", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True, nullable=False)
    source: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    colors: Mapped[List["ProductColor"]] = relationship(
        "ProductColor",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductColor.id",
        lazy="selectin",
    )

    @property
    def tags(self) -> List[str]:
        try:
            value = json.loads(self.tags_json or "[]")
            return value if isinstance(value, list) else []
        except (ValueError, TypeError):
            return []

    @tags.setter
    def tags(self, value: List[str]) -> None:
        self.tags_json = json.dumps(value or [], ensure_ascii=False)

    @property
    def primary_color(self) -> Optional["ProductColor"]:
        for c in self.colors:
            if c.is_primary:
                return c
        return self.colors[0] if self.colors else None

    def display_label(self) -> str:
        primary = self.primary_color
        color_name = (primary.name if primary else "") or (primary.hex if primary else "")
        parts = [self.shop_name.strip(), self.material.strip(), self.pile_length.strip(), color_name.strip()]
        parts = [part for part in parts if part]
        if not parts:
            return self.title
        return "【" + "-".join(parts) + "】"

    def to_dict(self, with_products: bool = False) -> dict:
        data = {
            "id": self.id,
            "title": self.title,
            "display_name": self.display_label(),
            "shop_name": self.shop_name,
            "shop_url": self.shop_url,
            "product_url": self.product_url,
            "external_id": self.external_id,
            "image_url": self.image_url,
            "price_cents": self.price_cents,
            "currency": self.currency,
            "material": self.material,
            "pile_length": self.pile_length,
            "width_cm": self.width_cm,
            "weight_gsm": self.weight_gsm,
            "description": self.description,
            "tags": self.tags,
            "status": self.status,
            "source": self.source,
            "colors": [c.to_dict(with_product=with_products) for c in self.colors],
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
            "updated_at": self.updated_at.isoformat() + "Z" if self.updated_at else None,
        }
        return data


class ProductColor(Base):
    __tablename__ = "product_colors"
    __table_args__ = (
        Index("ix_colors_family_hex", "family", "hex"),
        Index("ix_colors_product", "product_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(60), default="", nullable=False)
    hex: Mapped[str] = mapped_column(String(7), index=True, nullable=False)
    lab_l: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    lab_a: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    lab_b: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    family: Mapped[str] = mapped_column(String(20), default="", index=True, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    product: Mapped["Product"] = relationship("Product", back_populates="colors")

    def to_dict(self, with_product: bool = False) -> dict:
        data = {
            "id": self.id,
            "product_id": self.product_id,
            "name": self.name,
            "hex": self.hex,
            "lab": {"l": round(self.lab_l, 2), "a": round(self.lab_a, 2), "b": round(self.lab_b, 2)},
            "family": self.family,
            "is_primary": self.is_primary,
        }
        if with_product and self.product:
            data["product"] = {
                "id": self.product.id,
                "title": self.product.title,
                "image_url": self.product.image_url,
                "price_cents": self.product.price_cents,
                "shop_name": self.product.shop_name,
                "product_url": self.product.product_url,
                "status": self.product.status,
            }
        return data


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class RecommendationLog(Base):
    __tablename__ = "recommendation_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    hex: Mapped[str] = mapped_column(String(7), nullable=False)
    mode: Mapped[str] = mapped_column(String(20), default="local", nullable=False)
    provider: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    items_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    elapsed_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    feedback: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 0 未评价, 1 有用, -1 无用
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True, nullable=False)

    def to_dict(self, full: bool = False) -> dict:
        items = json.loads(self.items_json or "[]")
        data = {
            "id": self.id,
            "hex": self.hex,
            "mode": self.mode,
            "provider": self.provider,
            "summary": self.summary,
            "elapsed_ms": self.elapsed_ms,
            "feedback": self.feedback,
            "count": len(items),
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
        }
        if full:
            data["items"] = items
        return data


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    target_type: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    target_id: Mapped[str] = mapped_column(String(60), default="", nullable=False)
    detail: Mapped[str] = mapped_column(Text, default="", nullable=False)
    ip: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True, nullable=False)
