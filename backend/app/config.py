from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """运行配置。所有值都可用同名大写环境变量覆盖。"""

    app_name: str = "毛布选色 · 色研所"
    app_env: str = "production"
    app_port: int = 8000
    app_secret: str = ""
    data_dir: str = str(PROJECT_ROOT / "data")
    database_url: str = ""
    admin_username: str = "admin"
    admin_password: str = "admin123"
    # 0 = 不限制应用层大小；磁盘空间不足时上传接口返回 507
    upload_max_mb: int = 0
    session_days: int = 7
    cookie_secure: bool = False
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    static_dir: str = str(PROJECT_ROOT / "frontend" / "dist")
    log_level: str = "info"
    seed_demo: bool = False

    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @property
    def data_path(self) -> Path:
        return Path(self.data_dir).resolve()

    @property
    def upload_path(self) -> Path:
        return self.data_path / "uploads"

    @property
    def seed_image_path(self) -> Path:
        return self.upload_path / "seed"

    @property
    def db_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{(self.data_path / 'plushcolor.db').as_posix()}"

    @property
    def origins(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def static_path(self) -> Path:
        return Path(self.static_dir).resolve()


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
