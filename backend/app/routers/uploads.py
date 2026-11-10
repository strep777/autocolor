from __future__ import annotations

import json
import re
import shutil
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Request, UploadFile
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from ..config import settings
from ..deps import api_error, get_current_user
from ..models import User

router = APIRouter(prefix="/uploads", tags=["uploads"])

CHUNK_SIZE = 16 * 1024 * 1024
PREVIEW_MAX_BYTES = 512 * 1024 * 1024
PREVIEW_EDGE = 1600
UPLOAD_ID_RE = re.compile(r"^[0-9a-f]{32}$")

SIGNATURES = [
    (b"\xff\xd8\xff", "jpg", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "png", "image/png"),
]
WEBP_HEAD = b"RIFF"


class UploadInit(BaseModel):
    filename: str = Field(default="image", max_length=255)
    size: int = Field(ge=1)
    content_type: str = ""


def detect_image(head: bytes) -> tuple:
    for signature, ext, mime in SIGNATURES:
        if head.startswith(signature):
            return ext, mime
    if len(head) >= 12 and head.startswith(WEBP_HEAD) and head[8:12] == b"WEBP":
        return "webp", "image/webp"
    return None, None


def _parts_root() -> Path:
    path = settings.data_path / "upload-parts"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _session_dir(upload_id: str) -> Path:
    if not UPLOAD_ID_RE.match(upload_id):
        raise api_error(404, "upload_not_found", "上传任务不存在或已过期")
    path = _parts_root() / upload_id
    if not path.is_dir():
        raise api_error(404, "upload_not_found", "上传任务不存在或已过期")
    return path


def _load_meta(upload_id: str) -> dict:
    path = _session_dir(upload_id) / "meta.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise api_error(404, "upload_not_found", "上传任务不存在或已过期")


def _part_path(upload_id: str) -> Path:
    return _session_dir(upload_id) / "data.part"


def _human_bytes(value: int) -> str:
    size = float(value)
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size < 1024 or unit == "TB":
            return f"{size:.1f}{unit}"
        size /= 1024
    return f"{value}B"


def _make_preview(source: Path, stem: str) -> Optional[str]:
    """为常规图片生成展示缩略图；超大文件或解码失败时返回 None。

    50GB 级图片不做同步解码，避免上传完成接口被内存/CPU 拖死；
    原图仍然完整保留，可由调用方按原图地址访问。
    """
    if source.stat().st_size > PREVIEW_MAX_BYTES:
        return None
    try:
        from PIL import Image

        Image.MAX_IMAGE_PIXELS = None
        with Image.open(source) as image:
            if hasattr(image, "draft"):
                image.draft("RGB", (PREVIEW_EDGE, PREVIEW_EDGE))
            image.thumbnail((PREVIEW_EDGE, PREVIEW_EDGE))
            target = source.parent / f"{stem}.preview.jpg"
            image.convert("RGB").save(target, "JPEG", quality=86, optimize=True)
        return f"/uploads/{target.name}"
    except Exception:
        return None


def _finalize(upload_id: str) -> dict:
    meta = _load_meta(upload_id)
    part = _part_path(upload_id)
    size = part.stat().st_size
    if size != int(meta.get("size", 0)):
        raise api_error(
            400,
            "incomplete_upload",
            f"文件尚未上传完成：已收到 {_human_bytes(size)}，应为 {_human_bytes(int(meta.get('size', 0)))}",
        )

    with part.open("rb") as handle:
        head = handle.read(16)
    ext, mime = detect_image(head)
    if ext is None:
        shutil.rmtree(part.parent, ignore_errors=True)
        raise api_error(400, "invalid_image", "只支持 JPG、PNG、WebP 图片")

    target_dir: Path = settings.upload_path
    target_dir.mkdir(parents=True, exist_ok=True)
    stem = uuid.uuid4().hex
    final = target_dir / f"{stem}.{ext}"
    shutil.move(str(part), str(final))
    preview_url = _make_preview(final, stem)
    shutil.rmtree(part.parent, ignore_errors=True)

    return {
        "url": preview_url or f"/uploads/{final.name}",
        "original_url": f"/uploads/{final.name}",
        "preview_url": preview_url,
        "name": meta.get("filename") or final.name,
        "size": size,
        "type": mime,
        "max_mb": 0,
        "chunked": True,
    }


@router.post("/sessions")
async def create_upload_session(
    payload: UploadInit,
    _: User = Depends(get_current_user),
):
    parts = _parts_root()
    free = shutil.disk_usage(str(parts)).free
    if free < int(payload.size) + 512 * 1024 * 1024:
        raise api_error(
            507,
            "insufficient_storage",
            f"磁盘空间不足：需要约 {_human_bytes(int(payload.size) + 512 * 1024 * 1024)}，"
            f"当前可用 {_human_bytes(free)}",
        )

    upload_id = uuid.uuid4().hex
    folder = parts / upload_id
    folder.mkdir(parents=True, exist_ok=False)
    meta = {
        "filename": payload.filename,
        "size": int(payload.size),
        "content_type": payload.content_type,
        "created_at": int(time.time()),
    }
    (folder / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    (folder / "data.part").touch()
    return {
        "upload_id": upload_id,
        "chunk_size": CHUNK_SIZE,
        "offset": 0,
        "size": int(payload.size),
    }


@router.put("/sessions/{upload_id}")
async def upload_chunk(
    upload_id: str,
    request: Request,
    offset: int = 0,
    _: User = Depends(get_current_user),
):
    meta = _load_meta(upload_id)
    part = _part_path(upload_id)
    current = part.stat().st_size
    if offset != current:
        raise api_error(
            409,
            "offset_mismatch",
            f"上传偏移不一致：服务器已有 {current} 字节",
        )

    declared = int(meta.get("size", 0))
    if current >= declared:
        return {"offset": current, "size": declared, "done": True}

    total = current
    with part.open("ab") as handle:
        async for chunk in request.stream():
            if not chunk:
                continue
            if total + len(chunk) > declared:
                raise api_error(400, "size_mismatch", "上传数据超过声明的文件大小")
            handle.write(chunk)
            total += len(chunk)
            if total >= declared:
                break

    return {"offset": total, "size": declared, "done": total >= declared}


@router.post("/sessions/{upload_id}/complete")
async def complete_upload(
    upload_id: str,
    _: User = Depends(get_current_user),
):
    return await run_in_threadpool(_finalize, upload_id)


@router.delete("/sessions/{upload_id}")
async def cancel_upload(
    upload_id: str,
    _: User = Depends(get_current_user),
):
    folder = _session_dir(upload_id)
    shutil.rmtree(folder, ignore_errors=True)
    return {"ok": True}


@router.post("/images")
async def upload_image(
    file: UploadFile = File(...),
    _: User = Depends(get_current_user),
):
    """兼容旧的 multipart 上传；不设应用层大小上限，按 1MB 块流式落盘。"""
    head = await file.read(16)
    ext, mime = detect_image(head or b"")
    if ext is None:
        raise api_error(400, "invalid_image", "只支持 JPG、PNG、WebP 图片")

    target_dir: Path = settings.upload_path
    target_dir.mkdir(parents=True, exist_ok=True)
    stem = uuid.uuid4().hex
    target = target_dir / f"{stem}.{ext}"
    size = 0
    try:
        with target.open("wb") as handle:
            handle.write(head)
            size += len(head)
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
                size += len(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise

    preview_url = await run_in_threadpool(_make_preview, target, stem)
    return {
        "url": preview_url or f"/uploads/{target.name}",
        "original_url": f"/uploads/{target.name}",
        "preview_url": preview_url,
        "name": file.filename or target.name,
        "size": size,
        "type": mime,
        "max_mb": 0,
        "chunked": False,
    }
