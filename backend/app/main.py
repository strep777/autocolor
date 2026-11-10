from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import defaults
from .config import settings
from .database import SessionLocal, init_db
from .routers import ai, auth, colors, products, recommend, settings as settings_router, stats, uploads, users
from .services.seed import seed

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("plushcolor")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        seed(db)
    except Exception:  # pragma: no cover - 种子失败不应阻止启动
        logger.exception("初始数据初始化失败")
        db.rollback()
    finally:
        db.close()
    logger.info("%s 已启动，数据目录 %s", settings.app_name, settings.data_path)
    yield


app = FastAPI(
    title=defaults.APP_NAME,
    version="1.0.0",
    description="毛布选色、商品库与 AI 配色推荐系统",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Requested-With"],
)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.url.path.startswith("/api/"):
        origin = request.headers.get("origin")
        if origin and origin != "null":
            allowed = set(settings.origins)
            allowed.add(f"{request.url.scheme}://{request.headers.get('host', '')}")
            if origin not in allowed:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "跨站请求被拒绝", "code": "bad_origin"},
                )

    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["X-Response-Time"] = f"{(time.perf_counter() - started) * 1000:.1f}ms"
    if not request.url.path.startswith("/api/docs") and request.url.path != "/api/openapi.json":
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' data: blob: https: http:; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self'; "
            "font-src 'self' data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )
    return response


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail:
        payload = {"detail": detail.get("message", "请求失败"), "code": detail["code"]}
        if detail.get("fields"):
            payload["fields"] = detail["fields"]
        return JSONResponse(status_code=exc.status_code, content=payload, headers=dict(exc.headers or {}))
    return JSONResponse(status_code=exc.status_code, content={"detail": detail, "code": "http_error"})


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    fields = []
    for error in exc.errors():
        location = ".".join(str(part) for part in error.get("loc", []) if part != "body")
        fields.append({"field": location, "message": error.get("msg", "参数不合法")})
    return JSONResponse(
        status_code=400,
        content={"detail": "参数校验失败，请检查输入", "code": "validation_error", "fields": fields},
    )


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    logger.exception("未处理的异常: %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "服务器开小差了，请稍后重试", "code": "internal_error"})


@app.get("/api/health", tags=["system"])
def health():
    return {
        "status": "ok",
        "app": defaults.APP_NAME,
        "version": "1.0.0",
        "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


for router in (auth.router, users.router, products.router, colors.router, recommend.router, ai.router, settings_router.router, stats.router, uploads.router):
    app.include_router(router, prefix="/api")

settings.upload_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(settings.upload_path)), name="uploads")


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    if full_path.startswith("api/") or full_path.startswith("uploads/"):
        return JSONResponse(status_code=404, content={"detail": "接口不存在", "code": "not_found"})

    dist: Path = settings.static_path
    index = dist / "index.html"
    if not index.exists():
        return JSONResponse(
            {
                "app": defaults.APP_NAME,
                "message": "前端尚未构建。开发时请运行 npm run dev 并访问 http://localhost:5173；生产请先 npm run build。",
            }
        )

    candidate = (dist / full_path).resolve()
    try:
        candidate.relative_to(dist.resolve())
    except ValueError:
        return JSONResponse(status_code=404, content={"detail": "页面不存在", "code": "not_found"})
    if full_path and candidate.is_file():
        headers = {}
        if full_path.startswith("assets/"):
            headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return FileResponse(candidate, headers=headers)
    return FileResponse(index, headers={"Cache-Control": "no-cache"})
