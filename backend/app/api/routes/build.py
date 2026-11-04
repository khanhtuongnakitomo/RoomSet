"""Save answers, start or retry the build, and save a layout. Poll with GET /sessions/{id}."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import ensure_editable, owned_session
from app.api.presenters import session_view
from app.core.errors import AppError, Conflict
from app.db.engine import get_db
from app.db.models import SessionRow
from app.domain.clarification import RoomAnswers
from app.domain.scene import Placement
from app.domain.session import SessionView
from app.services.pipeline import claim_build, submit_build

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["build"])

MAX_COORDINATE_M = 50.0


@router.put("/answers")
def save_answers(
    body: RoomAnswers,
    row: SessionRow = Depends(owned_session),
    db: Session = Depends(get_db),
) -> SessionView:
    ensure_editable(row)
    if body.reconstruction_id:
        draft = row.reconstruction or {}
        if (
            draft.get("id") != body.reconstruction_id
            or draft.get("status") != "ready"
            or set(draft.get("photo_ids", [])) != {photo.id for photo in row.photos}
        ):
            raise AppError(
                "stale_photo_draft",
                "The photo draft changed. Use measured-room mode or make a new draft.",
                409,
            )
    row.answers = body.model_dump(mode="json")
    if row.status == "collecting":
        row.status = "needs_input"
    db.commit()
    return session_view(row)


@router.post("/build", status_code=202)
def start_build(
    row: SessionRow = Depends(owned_session), db: Session = Depends(get_db)
) -> SessionView:
    ensure_editable(row)
    if not (row.product or {}).get("confirmed"):
        raise AppError("product_unconfirmed", "Confirm the sofa dimensions first.", 409)
    if not row.answers:
        raise AppError("answers_missing", "Answer the room questions first.", 409)
    session_id = row.id
    db.commit()
    if not claim_build(session_id):
        raise Conflict("build_not_startable", "A model is already being built for this session.")
    submit_build(session_id)
    db.refresh(row)
    return session_view(row)


@router.put("/layout")
def save_layout(
    body: Placement,
    row: SessionRow = Depends(owned_session),
    db: Session = Depends(get_db),
) -> SessionView:
    """Stores position and yaw only. It never touches geometry or calls a model."""
    if row.status != "ready":
        raise Conflict("scene_not_ready", "The scene isn't ready yet.")
    if any(abs(value) > MAX_COORDINATE_M for value in (*body.position, body.yaw)):
        raise AppError("invalid_placement", "That placement is outside the planning area.", 422)
    row.placement = body.model_dump(mode="json")
    db.commit()
    return session_view(row)
