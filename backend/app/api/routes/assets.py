"""Authorized reads of generated files. Names come from an allow-list, never a raw path."""

import re

from fastapi import APIRouter, Depends, Response

from app.api.deps import owned_session
from app.core.errors import NotFound
from app.db.models import SessionRow
from app.services.pipeline import FURNITURE_ASSET, ROOM_ASSET, asset_key
from app.storage.base import get_storage

router = APIRouter(prefix="/api/sessions/{session_id}/assets", tags=["assets"])

RENDER_NAME = re.compile(r"^render-[0-9a-f-]{36}\.jpg$")
REFERENCE_NAME = re.compile(r"^reference-[0-9a-f]{32}\.jpg$")
SOFA_NAME = re.compile(r"^sofa-[0-9a-f]{32}\.glb$")
ROOM_NAME = re.compile(r"^room-[0-9a-f]{32}\.glb$")


def _media_type(name: str) -> str:
    if (
        name in (ROOM_ASSET, FURNITURE_ASSET)
        or SOFA_NAME.fullmatch(name)
        or ROOM_NAME.fullmatch(name)
    ):
        return "model/gltf-binary"
    if RENDER_NAME.fullmatch(name) or REFERENCE_NAME.fullmatch(name):
        return "image/jpeg"
    raise NotFound("Asset not found.")


@router.get("/{name}")
def read_asset(name: str, row: SessionRow = Depends(owned_session)) -> Response:
    media_type = _media_type(name)
    if row.scene is None and not REFERENCE_NAME.fullmatch(name):
        raise NotFound("Asset not found.")
    try:
        data = get_storage().get(asset_key(row.id, name))
    except Exception as exc:
        raise NotFound("Asset not found.") from exc
    return Response(data, media_type=media_type, headers={"Cache-Control": "private, no-store"})
