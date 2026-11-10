from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time
import threading
from collections import defaultdict, deque
from pathlib import Path
from typing import Deque, Dict, Optional, Tuple

from cryptography.fernet import Fernet, InvalidToken

from ..config import settings

PBKDF2_ITERATIONS = 260_000
COOKIE_NAME = "pc_session"
_failed: Dict[str, Deque[float]] = defaultdict(deque)
_lock = threading.Lock()
_fernet: Optional[Fernet] = None


# --------------------------------------------------------------------------
# 密钥
# --------------------------------------------------------------------------

def _secret_file() -> Path:
    return settings.data_path / ".app_secret"


def get_app_secret() -> str:
    """优先环境变量；否则读取/生成 data/.app_secret（仅宿主用户可读）。"""
    if settings.app_secret:
        return settings.app_secret
    path = _secret_file()
    if path.exists():
        value = path.read_text(encoding="utf-8").strip()
        if value:
            return value
    path.parent.mkdir(parents=True, exist_ok=True)
    value = secrets.token_urlsafe(48)
    path.write_text(value, encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return value


def get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        digest = hashlib.sha256(get_app_secret().encode("utf-8")).digest()
        _fernet = Fernet(base64.urlsafe_b64encode(digest))
    return _fernet


def encrypt_secret(value: str) -> str:
    if not value:
        return ""
    return "enc:" + get_fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str) -> str:
    if not value:
        return ""
    if not value.startswith("enc:"):
        return value
    try:
        return get_fernet().decrypt(value[4:].encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return ""


def mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "••••"
    return "••••••••" + value[-4:]


# --------------------------------------------------------------------------
# 密码
# --------------------------------------------------------------------------

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        PBKDF2_ITERATIONS,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_b64, hash_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return hmac.compare_digest(expected, actual)
    except (ValueError, TypeError):
        return False


# --------------------------------------------------------------------------
# 会话
# --------------------------------------------------------------------------

def new_session_token() -> Tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, token_hash(raw)


def token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------
# 登录限流（进程内，单实例足够）
# --------------------------------------------------------------------------

def login_blocked(ip: str) -> bool:
    limit = 5
    window = 300
    now = time.time()
    with _lock:
        q = _failed[ip]
        while q and now - q[0] > window:
            q.popleft()
        return len(q) >= limit


def record_login_failure(ip: str) -> None:
    with _lock:
        _failed[ip].append(time.time())


def clear_login_failures(ip: str) -> None:
    with _lock:
        _failed.pop(ip, None)


def client_ip(request) -> str:  # noqa: ANN001
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return getattr(request.client, "host", "") or "unknown"
