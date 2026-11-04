"""Product contract. Every dimension keeps where it came from and whether a person confirmed it."""

from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

FieldSource = Literal["listing_data", "listing_ai", "screenshot_ai", "user", "missing"]
Confidence = Literal["high", "medium", "low"]


class MeasuredField(BaseModel):
    value_m: float | None = None
    source: FieldSource = "missing"
    confidence: Confidence | None = None
    confirmed_by_user: bool = False
    extracted_value_m: float | None = None
    extracted_source: FieldSource | None = None


class SofaSpec(BaseModel):
    """Bounded appearance parameters, never executable model output."""

    template: Literal["plinth", "legs"] = "legs"
    cushions: int = Field(default=3, ge=1, le=4)
    arms: Literal["slim", "wide"] = "slim"
    color: str = Field(default="#6B8067", pattern=r"^#[0-9a-fA-F]{6}$")
    material: Literal["fabric", "leather"] = "fabric"


class ProductVersion(BaseModel):
    name: str
    width_m: float
    depth_m: float
    height_m: float
    geometry: SofaSpec
    source_url: str | None = None


class ProductDraft(BaseModel):
    """What we could read. Never used to build geometry until confirmed."""

    source_url: str | None = None
    name: str | None = None
    category: Literal["sofa"] = "sofa"
    width: MeasuredField = MeasuredField()
    depth: MeasuredField = MeasuredField()
    height: MeasuredField = MeasuredField()
    image_urls: list[str] = []
    appearance: str | None = None
    notes: list[str] = []
    geometry: SofaSpec = SofaSpec()
    geometry_source: Literal["default", "ai", "user"] = "default"
    reference_asset: str | None = None


class ProductConfirm(BaseModel):
    source_url: HttpUrl | None = None
    name: str = Field(min_length=1, max_length=200)
    width_m: float = Field(gt=0.3, lt=6.0)
    depth_m: float = Field(gt=0.3, lt=4.0)
    height_m: float = Field(gt=0.2, lt=2.5)
    image_urls: list[HttpUrl] = Field(default=[], max_length=8)
    appearance: str | None = Field(default=None, max_length=300)
    geometry: SofaSpec = SofaSpec()
    reference_asset: str | None = Field(default=None, pattern=r"^reference-[0-9a-f]{32}\.jpg$")


class Product(ProductDraft):
    confirmed: bool = False
    previous_versions: list[ProductVersion] = Field(default=[], max_length=8)


class ProductUrlIn(BaseModel):
    url: HttpUrl


class AppearanceRequest(BaseModel):
    description: str = Field(min_length=3, max_length=600)
