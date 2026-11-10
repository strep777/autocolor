from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

from .services.color import ColorError, normalize_hex

STATUSES = {"active", "draft", "archived"}
ROLES = {"admin", "user"}


def _clean_hex(value: str) -> str:
    try:
        return normalize_hex(value)
    except ColorError as exc:
        raise ValueError(str(exc)) from exc


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


class UserCreateIn(BaseModel):
    username: str = Field(min_length=2, max_length=50, pattern=r"^[A-Za-z0-9_\-\u4e00-\u9fa5]+$")
    password: str = Field(min_length=6, max_length=128)
    display_name: str = Field(default="", max_length=80)
    role: str = "user"

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        if v not in ROLES:
            raise ValueError("角色只能是 admin 或 user")
        return v


class UserUpdateIn(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=80)
    role: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("role")
    @classmethod
    def _role(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ROLES:
            raise ValueError("角色只能是 admin 或 user")
        return v


class PasswordResetIn(BaseModel):
    new_password: str = Field(min_length=6, max_length=128)


class ColorIn(BaseModel):
    name: str = Field(default="", max_length=60)
    hex: str
    is_primary: bool = False

    @field_validator("hex")
    @classmethod
    def _hex(cls, v: str) -> str:
        return _clean_hex(v)


class ProductIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    shop_name: str = Field(default="", max_length=80)
    shop_url: str = Field(default="", max_length=500)
    product_url: str = Field(default="", max_length=500)
    external_id: str = Field(default="", max_length=64)
    image_url: str = Field(default="", max_length=500)
    price_cents: Optional[int] = Field(default=None, ge=0, le=100_000_000)
    currency: str = Field(default="CNY", max_length=8)
    material: str = Field(default="", max_length=40)
    pile_length: str = Field(default="", max_length=20)
    width_cm: Optional[int] = Field(default=None, ge=0, le=10000)
    weight_gsm: Optional[int] = Field(default=None, ge=0, le=10000)
    description: str = Field(default="", max_length=4000)
    tags: List[str] = Field(default_factory=list, max_length=20)
    status: str = "active"
    colors: List[ColorIn] = Field(default_factory=list, max_length=200)

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in STATUSES:
            raise ValueError("状态只能是 active/draft/archived")
        return v

    @field_validator("tags")
    @classmethod
    def _tags(cls, v: List[str]) -> List[str]:
        return [str(t).strip()[:30] for t in v if str(t).strip()][:20]


class ProductUpdateIn(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    shop_name: Optional[str] = Field(default=None, max_length=80)
    shop_url: Optional[str] = Field(default=None, max_length=500)
    product_url: Optional[str] = Field(default=None, max_length=500)
    external_id: Optional[str] = Field(default=None, max_length=64)
    image_url: Optional[str] = Field(default=None, max_length=500)
    price_cents: Optional[int] = Field(default=None, ge=0, le=100_000_000)
    currency: Optional[str] = Field(default=None, max_length=8)
    material: Optional[str] = Field(default=None, max_length=40)
    pile_length: Optional[str] = Field(default=None, max_length=20)
    width_cm: Optional[int] = Field(default=None, ge=0, le=10000)
    weight_gsm: Optional[int] = Field(default=None, ge=0, le=10000)
    description: Optional[str] = Field(default=None, max_length=4000)
    tags: Optional[List[str]] = None
    status: Optional[str] = None
    colors: Optional[List[ColorIn]] = None

    @field_validator("status")
    @classmethod
    def _status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in STATUSES:
            raise ValueError("状态只能是 active/draft/archived")
        return v


class BulkIn(BaseModel):
    action: str
    ids: List[int] = Field(default_factory=list)
    all: bool = False
    filters: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("action")
    @classmethod
    def _action(cls, v: str) -> str:
        allowed = {"activate", "deactivate", "archive", "delete"}
        if v not in allowed:
            raise ValueError("不支持的批量操作")
        return v


class ImportIn(BaseModel):
    content: str = Field(min_length=1, max_length=5_000_000)
    format: str = "auto"
    mode: str = "merge"
    dry_run: bool = False

    @field_validator("format")
    @classmethod
    def _format(cls, v: str) -> str:
        if v not in {"auto", "json", "csv"}:
            raise ValueError("format 只能是 auto/json/csv")
        return v

    @field_validator("mode")
    @classmethod
    def _mode(cls, v: str) -> str:
        if v not in {"merge", "append"}:
            raise ValueError("mode 只能是 merge/append")
        return v


class RecommendIn(BaseModel):
    hex: str
    mode: str = "local"
    provider: Optional[str] = None
    limit: int = Field(default=8, ge=1, le=24)
    material: str = ""
    scene: str = Field(default="", max_length=50)
    only_close: bool = False

    @field_validator("hex")
    @classmethod
    def _hex(cls, v: str) -> str:
        return _clean_hex(v)

    @field_validator("mode")
    @classmethod
    def _mode(cls, v: str) -> str:
        if v not in {"local", "ai"}:
            raise ValueError("mode 只能是 local 或 ai")
        return v


class AIConfigIn(BaseModel):
    enabled: Optional[bool] = None
    provider: Optional[str] = None
    deepseek_base_url: Optional[str] = Field(default=None, max_length=300)
    deepseek_model: Optional[str] = Field(default=None, max_length=80)
    deepseek_api_key: Optional[str] = Field(default=None, max_length=300)
    ollama_base_url: Optional[str] = Field(default=None, max_length=300)
    ollama_model: Optional[str] = Field(default=None, max_length=80)
    temperature: Optional[float] = Field(default=None, ge=0, le=2)
    timeout_seconds: Optional[int] = Field(default=None, ge=5, le=180)
    prompt_deepseek: Optional[str] = Field(default=None, max_length=20000)
    prompt_ollama: Optional[str] = Field(default=None, max_length=20000)
    prompt_analyze: Optional[str] = Field(default=None, max_length=10000)

    @field_validator("provider")
    @classmethod
    def _provider(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in {"deepseek", "ollama"}:
            raise ValueError("provider 只能是 deepseek 或 ollama")
        return v


class AITestIn(BaseModel):
    provider: Optional[str] = None


class AnalyzeIn(BaseModel):
    hex: str
    scene: str = Field(default="", max_length=50)
    material: str = Field(default="", max_length=40)
    question: str = Field(default="", max_length=500)

    @field_validator("hex")
    @classmethod
    def _hex(cls, v: str) -> str:
        return _clean_hex(v)


class SettingsIn(BaseModel):
    values: Dict[str, Any]


class FeedbackIn(BaseModel):
    value: int

    @field_validator("value")
    @classmethod
    def _value(cls, v: int) -> int:
        if v not in {-1, 0, 1}:
            raise ValueError("反馈只能是 -1/0/1")
        return v
