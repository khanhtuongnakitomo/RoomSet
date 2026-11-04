"""Scene v1, shared with the browser editor.

Meters, right-handed, Y-up, floor on XZ. Floor points and positions are [x, z].
A wall's room side is the normal (-dz, dx) of its start-to-end direction; its thickness
extends away from the room. Sofa geometry: local X width, Y height, Z depth, pivot at base
center, back toward -Z. Yaw is radians about +Y. Node scale is always 1.
"""

from typing import Literal

from pydantic import BaseModel, Field

Vec2 = tuple[float, float]


class Wall(BaseModel):
    id: str
    start: Vec2
    end: Vec2
    height: float = Field(gt=0)
    thickness: float = Field(gt=0)


class Obstacle(BaseModel):
    kind: Literal["solid", "keep_clear"] = "solid"
    id: str
    label: str
    center: Vec2
    size: tuple[float, float, float] = Field(description="width, height, depth")
    yaw: float = 0.0


class Calibration(BaseModel):
    status: Literal["calibrated", "estimated"]
    method: str
    reference_distance_m: float | None = None


class Provenance(BaseModel):
    method: Literal["automatic", "assisted", "sample", "photo_assisted"]
    builder: str
    reconstruction_model: str | None = None
    created_at: str
    notes: list[str] = []


class Placement(BaseModel):
    position: Vec2
    yaw: float = 0.0


class Furniture(BaseModel):
    id: str
    name: str
    dimensions: tuple[float, float, float] = Field(description="width, height, depth")
    is_proxy: bool = True
    placement: Placement


class Assets(BaseModel):
    room: str
    furniture: str


class SceneV1(BaseModel):
    schema_version: Literal["scene.v1"] = "scene.v1"
    units: Literal["meters"] = "meters"
    up: Literal["Y"] = "Y"
    floor: list[Vec2] = Field(min_length=3)
    walls: list[Wall]
    obstacles: list[Obstacle] = []
    calibration: Calibration
    provenance: Provenance
    furniture: Furniture
    assets: Assets
    source_photos: list[str] = []
    warnings: list[str] = []
