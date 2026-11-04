"""Application wiring: middleware, routes, startup recovery, and the built frontend."""

import logging
import mimetypes
import threading
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import (
    assets,
    assistant,
    build,
    health,
    photos,
    product,
    reconstruction,
    renders,
    sessions,
    studio,
)
from app.core.config import get_settings
from app.core.errors import AppError, NotFound
from app.core.logging import configure_logging, request_id
from app.core.rate_limit import RateLimiter
from app.services.pipeline import fail_interrupted_builds
from app.services.reconstruction import recover_jobs
from app.services.retention import purge_expired, start_sweeper

# AR Quick Look opens USDZ only with its own media type.
mimetypes.add_type("model/vnd.usdz+zip", ".usdz")

log = logging.getLogger("roomset")

MAX_BODY_BYTES = 12 * 1024 * 1024
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": (
        "default-src 'self'; img-src 'self' blob: data: https:; style-src 'self' 'unsafe-inline'; "
        "connect-src 'self' blob:; media-src 'self' blob:; worker-src 'self' blob:; "
        "object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    ),
}


def _warn_on_unsafe_production(settings) -> None:
    if settings.roomset_env != "prod":
        return
    if settings.storage_backend == "local":
        log.warning("STORAGE_BACKEND=local in prod: files vanish if the disk is ephemeral")
    if settings.database_url.startswith("sqlite"):
        log.warning("SQLite in prod: sessions vanish if the disk is ephemeral")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_logging()
    _warn_on_unsafe_production(get_settings())
    interrupted = fail_interrupted_builds()
    recover_jobs()
    purged = purge_expired()
    log.info("started", extra={"fields": {"interrupted_builds": interrupted, "purged": purged}})
    stop = threading.Event()
    start_sweeper(stop)
    yield
    stop.set()


def _error(status: int, code: str, message: str) -> JSONResponse:
    body = {"error": {"code": code, "message": message, "request_id": request_id.get()}}
    return JSONResponse(body, status_code=status)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Roomset API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    general_limit = RateLimiter(settings.max_requests_per_minute)
    session_limit = RateLimiter(settings.max_sessions_per_minute)

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        token = request_id.set(uuid.uuid4().hex[:12])
        start = time.perf_counter()
        client = request.client.host if request.client else "unknown"
        path = request.url.path
        try:
            length = request.headers.get("content-length")
            if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
                response = _error(413, "body_too_large", "That upload is too large.")
            elif path.startswith("/api") and not general_limit.allow(client):
                response = _error(429, "rate_limited", "Too many requests. Wait a moment.")
            elif (
                request.method == "POST"
                and path.rstrip("/") in ("/api/sessions", "/api/sessions/sample")
                and not session_limit.allow(client)
            ):
                response = _error(429, "rate_limited", "Too many new sessions. Wait a moment.")
            else:
                try:
                    response = await call_next(request)
                except Exception:
                    # Handled here so the log and the reply keep this request's id.
                    log.exception("unhandled error")
                    response = _error(500, "internal_error", "Something went wrong on our side.")
            for header, value in SECURITY_HEADERS.items():
                response.headers.setdefault(header, value)
            route = request.scope.get("route")
            log.info(
                "request",
                extra={
                    "fields": {
                        "method": request.method,
                        # The route template keeps ids and query strings out of logs.
                        "route": getattr(route, "path", "unmatched"),
                        "status": response.status_code,
                        "ms": round((time.perf_counter() - start) * 1000),
                    }
                },
            )
            return response
        finally:
            request_id.reset(token)

    @app.exception_handler(AppError)
    async def handle_app_error(_request: Request, exc: AppError):
        return _error(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_request: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        field = ".".join(str(part) for part in first.get("loc", [])[1:])
        message = f"{field}: {first.get('msg', 'invalid value')}" if field else "Invalid request."
        return _error(422, "invalid_request", message)

    @app.exception_handler(Exception)
    async def handle_unexpected(_request: Request, exc: Exception):
        log.error("unhandled error", exc_info=exc)
        return _error(500, "internal_error", "Something went wrong on our side.")

    for module in (
        health,
        sessions,
        product,
        photos,
        build,
        assets,
        renders,
        studio,
        assistant,
        reconstruction,
    ):
        app.include_router(module.router)

    dist = Path(settings.frontend_dist)
    if dist.is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="static")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            if path.startswith("api/"):
                raise NotFound()
            candidate = (dist / path).resolve()
            if path and candidate.is_file() and candidate.is_relative_to(dist.resolve()):
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
