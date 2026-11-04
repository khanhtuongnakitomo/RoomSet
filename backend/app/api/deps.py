"""Request dependencies: database session, session ownership, and upload reading."""

from fastapi import Depends, Header, UploadFile
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, Conflict, NotFound
from app.core.security import token_matches
from app.db.engine import get_db
from app.db.models import SessionRow
from app.domain.session import BUSY_STATUSES


def owned_session(
    session_id: str,
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> SessionRow:
    """Wrong token and unknown id look identical, so ids cannot be probed."""
    scheme, _, token = authorization.partition(" ")
    row = db.get(SessionRow, session_id)
    if row is None or scheme.lower() != "bearer" or not token_matches(token, row.token_hash):
        raise NotFound("Session not found.")
    return row


def ensure_editable(row: SessionRow) -> None:
    if (row.reconstruction or {}).get("status") == "running":
        raise Conflict("reconstruction_running", "The photo draft is still being built.")
    if row.status in BUSY_STATUSES:
        raise Conflict("build_running", "A model is being built. Try again when it finishes.")


async def read_upload(file: UploadFile) -> bytes:
    limit = get_settings().max_upload_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise AppError("file_too_large", "That file is larger than 10 MB.", 413)
    if not data:
        raise AppError("empty_file", "That file is empty.", 400)
    return data
