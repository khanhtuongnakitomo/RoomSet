"""Session state and API shapes."""

from typing import Literal

from pydantic import BaseModel, Field

from app.domain.capture import CoverageReport, PhotoView
from app.domain.clarification import Clarification, RoomAnswers
from app.domain.product import Product
from app.domain.reconstruction import ReconstructionView
from app.domain.scene import Placement, SceneV1

SessionStatus = Literal[
    "collecting", "checking", "needs_input", "reconstructing", "building", "ready", "failed"
]
BUSY_STATUSES = ("reconstructing", "building")


class SessionError(BaseModel):
    code: str
    message: str
    retryable: bool = True


class RenderView(BaseModel):
    id: str
    asset: str
    style_prompt: str
    label: str = "AI-generated style preview. Not a measurement."


class SessionView(BaseModel):
    id: str
    status: SessionStatus
    product: Product | None = None
    photos: list[PhotoView] = []
    coverage: CoverageReport | None = None
    clarifications: list[Clarification] = []
    answers: RoomAnswers | None = None
    scene: SceneV1 | None = None
    placement: Placement | None = None
    renders: list[RenderView] = []
    error: SessionError | None = None
    reconstruction: ReconstructionView | None = None


class SessionCreated(BaseModel):
    session: SessionView
    token: str = Field(description="Shown once. Only its hash is stored.")


class Capabilities(BaseModel):
    product_ai: bool
    style_render: bool
    scene_builder: str
    reconstruction: Literal["assisted", "photo_assisted"] = "assisted"
    max_photos: int
    min_photos: int
    assistant: bool = False
