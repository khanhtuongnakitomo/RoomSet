"""Upload, read, and replace the corner photos, then run the combined review."""

import uuid

from fastapi import APIRouter, Depends, Response, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import ensure_editable, owned_session, read_upload
from app.api.presenters import session_view
from app.core.config import get_settings
from app.core.errors import AppError, NotFound
from app.db.engine import get_db
from app.db.models import PhotoRow, SessionRow
from app.domain.capture import PhotoView
from app.domain.session import SessionView
from app.services.clarifications import review_photos
from app.services.images import clean_image
from app.services.photo_checks import assess
from app.storage.base import get_storage

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["photos"])


def _invalidate_photo_draft(row: SessionRow) -> None:
    if row.reconstruction:
        row.reconstruction = {
            **row.reconstruction,
            "status": "failed",
            "result": None,
            "error": "The photos changed. Make a new photo draft or use measured-room mode.",
        }
    if row.answers:
        row.answers = {**row.answers, "reconstruction_id": None}


def _photo(row: SessionRow, photo_id: str) -> PhotoRow:
    photo = next((p for p in row.photos if p.id == photo_id), None)
    if photo is None:
        raise NotFound("Photo not found.")
    return photo


@router.post("/photos", status_code=201)
async def upload_photo(
    file: UploadFile,
    row: SessionRow = Depends(owned_session),
    db: Session = Depends(get_db),
) -> PhotoView:
    ensure_editable(row)
    settings = get_settings()
    if len(row.photos) >= settings.max_photos:
        raise AppError(
            "too_many_photos",
            f"You can use up to {settings.max_photos} photos. Replace a weak one instead.",
            409,
        )
    clean = clean_image(await read_upload(file))
    existing = {p.id: p.quality["dhash"] for p in row.photos}
    quality = assess(clean.pixels, existing)

    photo_id = str(uuid.uuid4())
    key = f"sessions/{row.id}/photos/{photo_id}.jpg"
    get_storage().put(key, clean.data, "image/jpeg")
    db.add(
        PhotoRow(
            id=photo_id,
            session_id=row.id,
            storage_key=key,
            width=clean.width,
            height=clean.height,
            quality=quality.model_dump(mode="json"),
        )
    )
    row.status = "collecting"
    _invalidate_photo_draft(row)
    db.commit()
    return PhotoView(id=photo_id, width=clean.width, height=clean.height, quality=quality)


@router.get("/photos/{photo_id}")
def read_photo(photo_id: str, row: SessionRow = Depends(owned_session)) -> Response:
    data = get_storage().get(_photo(row, photo_id).storage_key)
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "private, no-store"})


@router.delete("/photos/{photo_id}", status_code=204)
def delete_photo(
    photo_id: str,
    row: SessionRow = Depends(owned_session),
    db: Session = Depends(get_db),
) -> None:
    ensure_editable(row)
    photo = _photo(row, photo_id)
    get_storage().delete(photo.storage_key)
    row.photos.remove(photo)
    row.status = "collecting"
    _invalidate_photo_draft(row)
    db.commit()


@router.post("/check")
def check_capture(
    row: SessionRow = Depends(owned_session), db: Session = Depends(get_db)
) -> SessionView:
    ensure_editable(row)
    settings = get_settings()
    if not (row.product or {}).get("confirmed"):
        raise AppError("product_unconfirmed", "Confirm the sofa dimensions first.", 409)
    if len(row.photos) < settings.min_photos:
        raise AppError(
            "too_few_photos", f"Add at least {settings.min_photos} photos of this corner.", 409
        )
    row.status = "checking"
    keys = [p.storage_key for p in row.photos]
    flags = [p.quality["flags"] for p in row.photos]
    db.commit()  # Show progress and release the connection during the AI review.

    storage = get_storage()
    report, questions = review_photos([storage.get(k) for k in keys], flags)
    row.coverage = report.model_dump(mode="json")
    row.clarifications = [q.model_dump(mode="json") for q in questions]
    row.status = "needs_input"
    db.commit()
    return session_view(row)
