"""The build job: confirmed inputs -> simplified scene + GLB assets.

Only the assisted path exists today. Issue #4's VGGT spike plugs in at `_layout`, and its output
must set provenance.method to "automatic" only when it actually produced the geometry.
"""

import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from functools import lru_cache

from sqlalchemy import update

from app.core.config import get_settings
from app.core.errors import AppError
from app.db.engine import session_scope
from app.db.models import SessionRow
from app.domain.clarification import ObstacleIn, RoomAnswers
from app.domain.product import MeasuredField, Product
from app.domain.scene import (
    Assets,
    Calibration,
    Furniture,
    Placement,
    Provenance,
    SceneV1,
)
from app.domain.session import BUSY_STATUSES, SessionError
from app.geometry.room import assisted_layout
from app.services.clarifications import rule_questions
from app.services.scene_builders import BuildInput, get_builder
from app.storage.base import get_storage

log = logging.getLogger(__name__)

STARTABLE = ("needs_input", "failed", "ready")
ROOM_ASSET = "room.glb"
FURNITURE_ASSET = "sofa.glb"
FAILURE_MESSAGE = "We could not finish this model. Your inputs are saved; try again."
SAMPLE_NOTE = "Previously prepared sample. It was not made from your photos."


def asset_key(session_id: str, name: str) -> str:
    return f"sessions/{session_id}/assets/{name}"


@lru_cache
def _executor() -> ThreadPoolExecutor:
    return ThreadPoolExecutor(
        max_workers=get_settings().max_concurrent_jobs, thread_name_prefix="build"
    )


def claim_build(session_id: str) -> bool:
    """Atomic, so a double tap or a retry race cannot start two jobs."""
    with session_scope() as db:
        result = db.execute(
            update(SessionRow)
            .where(SessionRow.id == session_id, SessionRow.status.in_(STARTABLE))
            .values(
                status="reconstructing",
                error=None,
                build_attempts=SessionRow.build_attempts + 1,
            )
        )
        return result.rowcount == 1


def submit_build(session_id: str) -> None:
    _executor().submit(run_build, session_id)


def _set_status(session_id: str, status: str) -> None:
    with session_scope() as db:
        db.get(SessionRow, session_id).status = status


def default_placement(room_width: float, sofa_width: float, sofa_depth: float) -> Placement:
    """Back of the sofa near wall A, centered along it."""
    x = max(room_width / 2, sofa_width / 2 + 0.05)
    return Placement(position=(round(x, 3), round(sofa_depth / 2 + 0.05, 3)), yaw=0.0)


def _layout(answers: RoomAnswers):
    return assisted_layout(answers)


def compose_scene(
    session_id: str,
    product: Product,
    answers: RoomAnswers,
    photo_ids: list[str],
    method: str = "assisted",
    reconstruction: dict | None = None,
) -> SceneV1:
    floor, walls, obstacles = _layout(answers)
    size = (product.width.value_m, product.height.value_m, product.depth.value_m)
    output = get_builder().build(BuildInput(floor, walls, obstacles, size, product.geometry))

    warnings = (
        []
        if answers.dimensions_measured
        else ["Room size is your estimate. Clearances are approximate."]
    )
    notes = ["Room built using your confirmed measurements."]
    if method == "sample":
        notes = [SAMPLE_NOTE]
    photo_draft = reconstruction or {}
    if answers.reconstruction_id:
        if (
            photo_draft.get("id") != answers.reconstruction_id
            or photo_draft.get("status") != "ready"
        ):
            raise AppError(
                "stale_photo_draft",
                "The photo draft changed. Review the room measurements again.",
                409,
            )
        result = photo_draft["result"]
        within_tolerance = all(
            abs(value - result[key]) <= max(0.05, result[key] * 0.05)
            for key, value in (("width_m", answers.room_width_m), ("depth_m", answers.room_depth_m))
        )
        if within_tolerance:
            method = "photo_assisted"
            notes = result["notes"]
            warnings.append(
                "Photo-derived depth remains approximate. Verify tight clearances in person."
            )
        else:
            notes.append(
                "Photo-derived dimensions were corrected; "
                "the confirmed measurements drive this room."
            )
    revision = uuid.uuid4().hex
    room_name, sofa_name = f"room-{revision}.glb", f"sofa-{revision}.glb"
    storage = get_storage()
    storage.put(asset_key(session_id, room_name), output.room_glb, "model/gltf-binary")
    storage.put(asset_key(session_id, sofa_name), output.furniture_glb, "model/gltf-binary")
    return SceneV1(
        floor=floor,
        walls=walls,
        obstacles=obstacles,
        calibration=Calibration(
            status="calibrated" if answers.dimensions_measured else "estimated",
            method="user_tape_measure" if answers.dimensions_measured else "user_estimate",
        ),
        provenance=Provenance(
            method=method,
            builder=output.builder,
            reconstruction_model="facebook/VGGT-1B" if method == "photo_assisted" else None,
            created_at=datetime.now(UTC).isoformat(),
            notes=notes,
        ),
        furniture=Furniture(
            id="sofa",
            name=product.name or "Sofa",
            dimensions=size,
            is_proxy=True,
            placement=default_placement(answers.room_width_m, size[0], size[2]),
        ),
        assets=Assets(room=room_name, furniture=sofa_name),
        source_photos=photo_ids,
        warnings=warnings,
    )


def run_build(session_id: str) -> None:
    try:
        with session_scope() as db:
            row = db.get(SessionRow, session_id)
            product = Product.model_validate(row.product)
            answers = RoomAnswers.model_validate(row.answers)
            photo_ids = [photo.id for photo in row.photos]
            reconstruction = row.reconstruction
        _set_status(session_id, "building")
        scene = compose_scene(
            session_id, product, answers, photo_ids, reconstruction=reconstruction
        )
        with session_scope() as db:
            row = db.get(SessionRow, session_id)
            row.scene = scene.model_dump(mode="json")
            row.renders = []
            row.placement = scene.furniture.placement.model_dump(mode="json")
            row.status = "ready"
    except Exception as exc:
        code = exc.code if isinstance(exc, AppError) else "build_failed"
        message = exc.message if isinstance(exc, AppError) else FAILURE_MESSAGE
        log.exception("build failed", extra={"fields": {"session_id": session_id, "code": code}})
        with session_scope() as db:
            row = db.get(SessionRow, session_id)
            if row:
                row.status = "failed"
                row.error = SessionError(code=code, message=message).model_dump()


def sample_inputs() -> tuple[Product, RoomAnswers]:
    """The prepared corner behind the fit demo: a 250 cm sofa against a 240 cm wall."""
    product = Product(
        name="Demo sofa — 250 cm",
        width=MeasuredField(value_m=2.5, source="user", confidence="high"),
        depth=MeasuredField(value_m=0.92, source="user", confidence="high"),
        height=MeasuredField(value_m=0.84, source="user", confidence="high"),
        confirmed=True,
    )
    answers = RoomAnswers(
        room_width_m=2.4,
        room_depth_m=2.8,
        dimensions_measured=False,
        obstacles=[
            ObstacleIn(
                label="Door clearance",
                kind="keep_clear",
                width_m=0.8,
                depth_m=0.9,
                height_m=0.1,
                x_m=1.95,
                z_m=1.9,
            ),
        ],
    )
    return product, answers


def build_sample(session_id: str) -> None:
    """A labelled example, so people can try the editor without photos."""
    product, answers = sample_inputs()
    scene = compose_scene(session_id, product, answers, [], method="sample")
    with session_scope() as db:
        row = db.get(SessionRow, session_id)
        row.product = product.model_dump(mode="json")
        row.answers = answers.model_dump(mode="json")
        row.clarifications = [q.model_dump(mode="json") for q in rule_questions()]
        row.scene = scene.model_dump(mode="json")
        row.placement = scene.furniture.placement.model_dump(mode="json")
        row.status = "ready"


def fail_interrupted_builds() -> int:
    """A restart loses in-process jobs, so report them as retryable instead of spinning forever."""
    with session_scope() as db:
        result = db.execute(
            update(SessionRow)
            .where(SessionRow.status.in_(BUSY_STATUSES))
            .values(
                status="failed",
                error=SessionError(code="interrupted", message=FAILURE_MESSAGE).model_dump(),
            )
        )
        return result.rowcount
