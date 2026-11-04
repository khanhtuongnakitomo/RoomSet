"""A photo-derived corner needs explicit floor anchors and a real scale reference."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

UnitCoordinate = Annotated[float, Field(ge=0, le=1)]
ImagePoint = tuple[UnitCoordinate, UnitCoordinate]


class ReconstructionRequest(BaseModel):
    photo_id: str
    corner: ImagePoint
    wall_a: ImagePoint
    wall_b: ImagePoint
    reference_width_m: float = Field(ge=1, le=15)


class ReconstructionResult(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    width_m: float = Field(ge=1, le=15)
    depth_m: float = Field(ge=1, le=15)
    angle_degrees: float
    model: str = "facebook/VGGT-1B"
    point_count: int
    notes: list[str]


class ReconstructionView(BaseModel):
    id: str
    status: Literal["running", "ready", "failed"]
    attempts: int = 1
    photo_ids: list[str]
    request: ReconstructionRequest
    result: ReconstructionResult | None = None
    error: str | None = None
