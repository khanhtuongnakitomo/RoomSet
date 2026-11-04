"""Bounded, persisted photo jobs for the single-instance demo server."""

import json
import logging
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import get_settings
from app.core.errors import AppError
from app.db.engine import session_scope
from app.db.models import SessionRow
from app.domain.reconstruction import ReconstructionRequest, ReconstructionView
from app.geometry.photo_corner import fit_corner
from app.storage.base import get_storage

log = logging.getLogger(__name__)
_slot = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="photo-draft")


def reserve_job() -> None:
    """Called while holding the only GPU job slot; counts survive a server restart."""
    settings = get_settings()
    path = Path(settings.reconstruction_usage_file)
    today = datetime.now(UTC).date().isoformat()
    ledger = json.loads(path.read_text()) if path.exists() else {}
    count = ledger.get(today, 0)
    if count >= settings.reconstruction_daily_limit:
        raise AppError(
            "photo_limit",
            "Today's photo reconstruction limit is reached. Use measured-room mode.",
            429,
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps({today: count + 1}))
    temporary.replace(path)


def start(row: SessionRow, db, request: ReconstructionRequest) -> None:
    if not _slot.acquire(blocking=False):
        raise AppError("photo_busy", "Another photo draft is being built. Try again shortly.", 409)
    try:
        reserve_job()
        ids = [request.photo_id] + [
            photo.id for photo in row.photos if photo.id != request.photo_id
        ]
        job = ReconstructionView(
            id=uuid.uuid4().hex,
            status="running",
            photo_ids=ids,
            request=request,
            attempts=(row.reconstruction or {}).get("attempts", 0) + 1,
        )
        row.reconstruction = job.model_dump(mode="json")
        row.status = "needs_input"
        db.commit()
        _executor.submit(_run, row.id, job.id)
    except Exception:
        _slot.release()
        raise


def _run(session_id: str, job_id: str) -> None:
    try:
        with session_scope() as db:
            row = db.get(SessionRow, session_id)
            job = ReconstructionView.model_validate(row.reconstruction)
            if job.id != job_id or job.status != "running":
                return
            keys = {photo.id: photo.storage_key for photo in row.photos}
            photos = [get_storage().get(keys[photo_id]) for photo_id in job.photo_ids]
        from app.providers.modal_reconstruction import run

        request = job.request
        output = run(photos, [list(request.corner), list(request.wall_a), list(request.wall_b)])
        result = fit_corner(output["anchors"], request.reference_width_m, output["point_count"])
        job.status, job.result = "ready", result
    except Exception:
        log.exception("photo reconstruction failed", extra={"fields": {"job_id": job_id}})
        with session_scope() as db:
            row = db.get(SessionRow, session_id)
            if row and (row.reconstruction or {}).get("id") == job_id:
                job = ReconstructionView.model_validate(row.reconstruction)
                job.status = "failed"
                job.error = (
                    "Photo reconstruction did not produce a usable corner. "
                    "Check your floor markers or continue with measured-room mode."
                )
    finally:
        try:
            with session_scope() as db:
                row = db.get(SessionRow, session_id)
                if (
                    row
                    and (row.reconstruction or {}).get("id") == job_id
                    and row.reconstruction.get("status") == "running"
                    and "job" in locals()
                ):
                    row.reconstruction = job.model_dump(mode="json")
        finally:
            _slot.release()


def recover_jobs() -> None:
    with session_scope() as db:
        for row in db.query(SessionRow).filter(SessionRow.reconstruction.is_not(None)).all():
            if row.reconstruction.get("status") == "running":
                row.reconstruction = {
                    **row.reconstruction,
                    "status": "failed",
                    "error": (
                        "The server restarted. Your photos are saved; "
                        "retry the photo draft or use measurements."
                    ),
                }
