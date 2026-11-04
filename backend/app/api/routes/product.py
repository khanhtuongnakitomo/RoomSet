"""Private product references, validated appearance, and confirmed metric furniture."""

import uuid

from fastapi import APIRouter, Depends, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.api.deps import ensure_editable, owned_session, read_upload
from app.api.presenters import session_view
from app.core.errors import AppError, ProviderUnavailable
from app.db.engine import get_db
from app.db.models import SessionRow
from app.domain.product import (
    AppearanceRequest,
    MeasuredField,
    Product,
    ProductConfirm,
    ProductDraft,
    ProductUrlIn,
    ProductVersion,
    SofaSpec,
)
from app.domain.session import SessionView
from app.geometry.parametric_sofa import build_parametric_sofa
from app.services.images import clean_image
from app.services.pipeline import asset_key
from app.services.product_intake import read_appearance, read_listing, read_screenshot
from app.services.url_guard import fetch_public
from app.storage.base import get_storage

router = APIRouter(prefix="/api/sessions/{session_id}/product", tags=["product"])


def _history(previous: Product) -> list[ProductVersion]:
    history = list(previous.previous_versions)
    if previous.confirmed:
        version = ProductVersion(
            name=previous.name or "Sofa",
            width_m=previous.width.value_m,
            depth_m=previous.depth.value_m,
            height_m=previous.height.value_m,
            geometry=previous.geometry,
            source_url=previous.source_url,
        )
        if not history or history[-1] != version:
            history.append(version)
    return history[-8:]


def _reference(row: SessionRow, jpeg: bytes) -> str:
    name = f"reference-{uuid.uuid4().hex}.jpg"
    get_storage().put(asset_key(row.id, name), jpeg, "image/jpeg")
    return name


def _save_draft(row: SessionRow, db: Session, draft: ProductDraft) -> ProductDraft:
    db.refresh(row)
    ensure_editable(row)
    previous = Product.model_validate(row.product or {})
    row.product = Product(**draft.model_dump(), previous_versions=_history(previous)).model_dump()
    db.commit()
    return draft


@router.post("/fetch")
def fetch_listing(
    body: ProductUrlIn,
    row: SessionRow = Depends(owned_session),
    db: Session = Depends(get_db),
) -> ProductDraft:
    ensure_editable(row)
    db.commit()
    draft = read_listing(str(body.url))
    if draft.image_urls:
        try:
            image = clean_image(fetch_public(draft.image_urls[0]).body)
            draft.reference_asset = _reference(row, image.data)
        except Exception:
            draft.notes.append("The product image could not be saved. You can upload it instead.")
    return _save_draft(row, db, draft)


@router.post("/screenshot")
async def fetch_screenshot(
    file: UploadFile,
    row: SessionRow = Depends(owned_session),
    db: Session = Depends(get_db),
) -> ProductDraft:
    ensure_editable(row)
    clean = clean_image(await read_upload(file))
    name = _reference(row, clean.data)
    db.commit()
    try:
        draft = await run_in_threadpool(read_screenshot, clean.data)
    except ProviderUnavailable:
        draft = ProductDraft(
            notes=["Your image is saved. Enter its dimensions and appearance below."]
        )
    draft.reference_asset = name
    return _save_draft(row, db, draft)


@router.post("/preview")
def preview_product(body: ProductConfirm, row: SessionRow = Depends(owned_session)) -> Response:
    ensure_editable(row)
    glb = build_parametric_sofa(body.width_m, body.height_m, body.depth_m, body.geometry)
    return Response(
        glb, media_type="model/gltf-binary", headers={"Cache-Control": "private, no-store"}
    )


@router.post("/appearance")
def suggest_appearance(
    body: AppearanceRequest,
    row: SessionRow = Depends(owned_session),
    db: Session = Depends(get_db),
) -> SofaSpec:
    ensure_editable(row)
    db.commit()
    return read_appearance(body.description)


def _confirmed(value: float, prior: MeasuredField) -> MeasuredField:
    evidence_value = (
        prior.extracted_value_m if prior.extracted_value_m is not None else prior.value_m
    )
    evidence_source = prior.extracted_source or prior.source
    same = prior.value_m is not None and abs(value - prior.value_m) < 0.0001
    return MeasuredField(
        value_m=value,
        source=prior.source if same else "user",
        confidence=prior.confidence if same else "high",
        confirmed_by_user=True,
        extracted_value_m=evidence_value,
        extracted_source=evidence_source,
    )


@router.put("")
def confirm_product(
    body: ProductConfirm,
    row: SessionRow = Depends(owned_session),
    db: Session = Depends(get_db),
) -> SessionView:
    ensure_editable(row)
    previous = Product.model_validate(row.product or {})
    if body.reference_asset and body.reference_asset != previous.reference_asset:
        raise AppError("invalid_reference", "Upload the product image again.", 422)
    product = Product(
        source_url=str(body.source_url) if body.source_url else None,
        name=body.name,
        width=_confirmed(body.width_m, previous.width),
        depth=_confirmed(body.depth_m, previous.depth),
        height=_confirmed(body.height_m, previous.height),
        image_urls=[str(url) for url in body.image_urls],
        appearance=body.appearance,
        geometry=body.geometry,
        geometry_source="user",
        reference_asset=body.reference_asset,
        previous_versions=_history(previous),
        confirmed=True,
    )
    if row.scene:
        # A product variant changes only the furniture; keep the room and saved placement.
        name = f"sofa-{uuid.uuid4().hex}.glb"
        glb = build_parametric_sofa(body.width_m, body.height_m, body.depth_m, body.geometry)
        get_storage().put(asset_key(row.id, name), glb, "model/gltf-binary")
        scene = dict(row.scene)
        scene["assets"] = {**scene["assets"], "furniture": name}
        scene["furniture"] = {
            **scene["furniture"],
            "name": body.name,
            "dimensions": [body.width_m, body.height_m, body.depth_m],
        }
        row.scene = scene
        row.renders = []
    row.product = product.model_dump(mode="json")
    db.commit()
    return session_view(row)
