"""Liveness, readiness and public capability flags."""

from fastapi import APIRouter, Response
from sqlalchemy import text

from app.core.config import get_settings
from app.db.engine import get_engine
from app.domain.session import Capabilities
from app.storage.base import get_storage

router = APIRouter(tags=["health"])


@router.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}


@router.get("/readyz")
def readyz(response: Response) -> dict:
    checks = {"database": "ok", "storage": "ok"}
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        checks["database"] = "failed"
    try:
        get_storage().ping()
    except Exception:
        checks["storage"] = "failed"
    if "failed" in checks.values():
        response.status_code = 503
    return checks


@router.get("/api/capabilities")
def capabilities() -> Capabilities:
    settings = get_settings()
    return Capabilities(
        product_ai=settings.spark_enabled,
        style_render=settings.image_enabled,
        scene_builder=settings.scene_builder,
        reconstruction="photo_assisted" if settings.reconstruction_enabled else "assisted",
        max_photos=settings.max_photos,
        min_photos=settings.min_photos,
        assistant=settings.assistant_enabled,
    )
