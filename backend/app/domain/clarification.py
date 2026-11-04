"""Questions we ask, and the validated answers that drive assisted geometry."""

from typing import Literal

from pydantic import BaseModel, Field


class Clarification(BaseModel):
    id: str
    question: str
    help: str | None = None
    answer_type: Literal["number", "boolean", "text", "obstacles"]
    affected_field: str
    blocking: bool
    unit: str | None = None
    origin: Literal["rules", "ai"] = "rules"


class ObstacleIn(BaseModel):
    kind: Literal["solid", "keep_clear"] = "solid"
    label: str = Field(min_length=1, max_length=60)
    width_m: float = Field(gt=0.02, lt=10)
    depth_m: float = Field(gt=0.02, lt=10)
    height_m: float = Field(default=1.0, gt=0.02, lt=5)
    x_m: float = Field(ge=0, lt=30, description="Distance from wall B to the obstacle center")
    z_m: float = Field(ge=0, lt=30, description="Distance from wall A to the obstacle center")


class RoomAnswers(BaseModel):
    reconstruction_id: str | None = None
    room_width_m: float = Field(ge=1.0, le=30, description="Usable length along wall A")
    room_depth_m: float = Field(ge=1.0, le=30, description="Usable length along wall B")
    ceiling_height_m: float | None = Field(default=None, ge=1.8, le=8)
    dimensions_measured: bool
    obstacles: list[ObstacleIn] = Field(default=[], max_length=12)
    notes: str | None = Field(default=None, max_length=500)
