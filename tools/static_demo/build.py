"""Prebuilds the fit demo so it also runs where there is no server, such as a Vercel preview.

Uses the same inputs and builders as POST /api/sessions/sample, so the two cannot drift apart.
Run from the repo root:  backend/.venv/bin/python tools/static_demo/build.py
Writes frontend/public/samples/fit/: scene.json, room.glb, sofa-250.glb, sofa-210.glb.
"""

import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
_work = tempfile.mkdtemp(prefix="roomset-sample-")
os.environ.update(STORAGE_BACKEND="local", LOCAL_STORAGE_DIR=_work, SCENE_BUILDER="local")

from app.domain.product import MeasuredField  # noqa: E402
from app.geometry.parametric_sofa import build_parametric_sofa  # noqa: E402
from app.services.pipeline import asset_key, compose_scene, sample_inputs  # noqa: E402
from app.storage.base import get_storage  # noqa: E402

OUT = ROOT / "frontend/public/samples/fit"
VARIANT_WIDTH_M = 2.1


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    product, answers = sample_inputs()
    scene = compose_scene("sample", product, answers, [], method="sample")
    (OUT / "room.glb").write_bytes(get_storage().get(asset_key("sample", scene.assets.room)))
    (OUT / "sofa-250.glb").write_bytes(
        get_storage().get(asset_key("sample", scene.assets.furniture))
    )
    variant = product.model_copy(
        update={"width": MeasuredField(value_m=VARIANT_WIDTH_M, source="user", confidence="high")}
    )
    (OUT / "sofa-210.glb").write_bytes(
        build_parametric_sofa(
            VARIANT_WIDTH_M, variant.height.value_m, variant.depth.value_m, variant.geometry
        )
    )
    data = scene.model_dump(mode="json")
    data["assets"] = {"room": "room.glb", "furniture": "sofa-250.glb"}
    (OUT / "scene.json").write_text(json.dumps(data, indent=1) + "\n")
    print({path.name: path.stat().st_size for path in sorted(OUT.iterdir())})


if __name__ == "__main__":
    main()
