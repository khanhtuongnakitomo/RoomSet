"""Where GLB files get made. Same inputs and outputs for the free CPU path and Blender on Modal."""

from dataclasses import dataclass
from typing import Protocol

from app.core.config import get_settings
from app.core.errors import ProviderUnavailable
from app.domain.product import SofaSpec
from app.geometry.parametric_sofa import build_parametric_sofa
from app.geometry.room import build_room_glb
from app.geometry.sofa import build_sofa_glb


@dataclass
class BuildInput:
    floor: list
    walls: list
    obstacles: list
    sofa_size: tuple[float, float, float]  # width, height, depth
    sofa_spec: SofaSpec | None = None


@dataclass
class BuildOutput:
    room_glb: bytes
    furniture_glb: bytes
    builder: str


class SceneBuilder(Protocol):
    def build(self, spec: BuildInput) -> BuildOutput: ...


class LocalBuilder:
    def build(self, spec: BuildInput) -> BuildOutput:
        return BuildOutput(
            room_glb=build_room_glb(spec.floor, spec.walls, spec.obstacles),
            furniture_glb=(
                build_parametric_sofa(*spec.sofa_size, spec.sofa_spec)
                if spec.sofa_spec
                else build_sofa_glb(*spec.sofa_size)
            ),
            builder="trimesh-cpu",
        )


class ModalBuilder:
    """Calls worker/modal_app.py. Unverified until a real Modal job is run and recorded."""

    def build(self, spec: BuildInput) -> BuildOutput:
        try:
            import modal
        except ImportError as exc:
            raise ProviderUnavailable("modal_missing", "The Modal SDK is not installed.") from exc
        payload = {
            "floor": spec.floor,
            "walls": [w.model_dump() for w in spec.walls],
            "obstacles": [o.model_dump() for o in spec.obstacles],
            "sofa_size": spec.sofa_size,
        }
        name = get_settings().modal_app_name
        try:
            result = modal.Function.from_name(name, "build_scene").remote(payload)
        except Exception as exc:
            raise ProviderUnavailable(
                "modal_failed", "We could not finish this model. Your inputs are saved; try again."
            ) from exc
        furniture = (
            build_parametric_sofa(*spec.sofa_size, spec.sofa_spec)
            if spec.sofa_spec
            else result["furniture_glb"]
        )
        return BuildOutput(result["room_glb"], furniture, "blender-modal")


def get_builder() -> SceneBuilder:
    return ModalBuilder() if get_settings().scene_builder == "modal" else LocalBuilder()
