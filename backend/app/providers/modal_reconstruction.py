"""Ephemeral VGGT inference on Modal. No public endpoint or permanent GPU deployment.

The default checkpoint is for the non-commercial hackathon prototype. Commercial use requires
the separately licensed checkpoint. Code is pinned to an inspected upstream revision.
"""

from functools import lru_cache
from pathlib import Path

import modal

VGGT_REVISION = "a288dd0f14786c93483e45524328726ab7b1b4ce"
app = modal.App("roomset-photo-draft")
weights = modal.Volume.from_name("roomset-vggt-weights", create_if_missing=True)
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install(
        "torch==2.8.0",
        "torchvision==0.23.0",
        "numpy<3",
        "Pillow>=10",
        "huggingface_hub<1",
        "safetensors",
        "einops",
    )
    .pip_install(f"git+https://github.com/facebookresearch/vggt.git@{VGGT_REVISION}")
    .env({"HF_HOME": "/cache/huggingface", "TORCH_HOME": "/cache/torch"})
)


@lru_cache(maxsize=1)
def _loaded_model():
    from vggt.models.vggt import VGGT

    return VGGT.from_pretrained("facebook/VGGT-1B").eval().to("cuda")


@app.function(
    image=image, gpu="L4", memory=16384, timeout=900, max_containers=1, volumes={"/cache": weights}
)
def reconstruct(photos: list[bytes], marks: list[list[float]]) -> dict:
    import tempfile
    import time

    import numpy as np
    import torch
    from vggt.utils.geometry import unproject_depth_map_to_point_map
    from vggt.utils.load_fn import load_and_preprocess_images_square
    from vggt.utils.pose_enc import pose_encoding_to_extri_intri

    if not 3 <= len(photos) <= 6 or len(marks) != 3:
        raise ValueError("Use three to six photos and three floor markers.")
    started = time.monotonic()
    model = _loaded_model()
    weights.commit()
    with tempfile.TemporaryDirectory() as directory:
        paths = []
        for index, data in enumerate(photos):
            path = Path(directory) / f"{index}.jpg"
            path.write_bytes(data)
            paths.append(str(path))
        images, mappings = load_and_preprocess_images_square(paths, target_size=518)
        images = images.to("cuda")
        with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):
            predictions = model(images)
        extrinsics, intrinsics = pose_encoding_to_extri_intri(
            predictions["pose_enc"], images.shape[-2:]
        )
        depth = predictions["depth"][0].float().cpu().numpy()
        confidence = predictions["depth_conf"][0].float().cpu().numpy()
        points = unproject_depth_map_to_point_map(
            depth, extrinsics[0].float().cpu().numpy(), intrinsics[0].float().cpu().numpy()
        )
        mapping = mappings[0].numpy()
        x1, y1, x2, y2 = mapping[:4]
        anchors = []
        for u, v in marks:
            x = int(np.clip(round(x1 + u * (x2 - x1)), 2, 515))
            y = int(np.clip(round(y1 + v * (y2 - y1)), 2, 515))
            patch = points[0, y - 2 : y + 3, x - 2 : x + 3]
            scores = confidence[0, y - 2 : y + 3, x - 2 : x + 3]
            valid = np.isfinite(patch).all(axis=-1) & (scores >= np.percentile(confidence[0], 30))
            if valid.sum() < 8:
                raise ValueError("A floor marker has low depth confidence. Choose a clearer point.")
            anchors.append(np.median(patch[valid], axis=0).tolist())
        valid_points = np.isfinite(points).all(axis=-1) & (
            confidence > np.percentile(confidence, 50)
        )
        return {
            "anchors": anchors,
            "point_count": int(valid_points.sum()),
            "seconds": round(time.monotonic() - started, 2),
        }


def run(photos: list[bytes], marks: list[list[float]]) -> dict:
    # The app and its GPU stop when this single call finishes; cached weights remain.
    with app.run():
        return reconstruct.remote(photos, marks)
