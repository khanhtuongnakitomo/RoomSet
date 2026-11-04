"""Start a photo job; poll its persisted status through the existing session endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import ensure_editable, owned_session
from app.api.presenters import session_view
from app.core.config import get_settings
from app.core.errors import AppError
from app.db.engine import get_db
from app.db.models import SessionRow
from app.domain.reconstruction import ReconstructionRequest
from app.domain.session import SessionView
from app.services.reconstruction import start

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["reconstruction"])


@router.post("/reconstruction", status_code=202)
def reconstruct(
    body: ReconstructionRequest,
    row: SessionRow = Depends(owned_session),
    db: Session = Depends(get_db),
) -> SessionView:
    ensure_editable(row)
    if not get_settings().reconstruction_enabled:
        raise AppError(
            "photo_disabled", "Photo reconstruction is not enabled. Use measured-room mode.", 503
        )
    if not (row.product or {}).get("confirmed"):
        raise AppError("product_unconfirmed", "Confirm your sofa first.", 409)
    if not 3 <= len(row.photos) <= 6 or body.photo_id not in {p.id for p in row.photos}:
        raise AppError(
            "photo_inputs", "Add three to six overlapping photos and mark one of them.", 422
        )
    if (row.reconstruction or {}).get("attempts", 0) >= 3:
        raise AppError(
            "photo_attempts",
            "Use measured-room mode for this plan; three attempts have been used.",
            429,
        )
    if (row.coverage or {}).get("semantic_same_area") is False:
        raise AppError("photo_coverage", "Use overlapping photos of the same corner.", 422)
    if sum("duplicate" not in p.quality.get("flags", []) for p in row.photos) < 3:
        raise AppError("photo_duplicates", "Use at least three different viewpoints.", 422)
    start(row, db, body)
    return session_view(row)
