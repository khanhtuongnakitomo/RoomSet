"""Two approximate sofa templates whose outer bounds equal the confirmed product size."""

import numpy as np
import trimesh
from trimesh.visual.texture import TextureVisuals

from app.domain.product import SofaSpec
from app.geometry.meshes import box, export_glb, material


def _cushion(size, center, color, roughness):
    # A rounded cuboid built from a sphere. Preserve its analytical surface normals.
    mesh = trimesh.creation.icosphere(subdivisions=3)
    normals = mesh.vertices.copy()
    radius = min(size) * 0.22
    mesh.vertices = normals * radius + np.sign(normals) * (np.array(size) / 2 - radius) + center
    mesh.vertex_normals = normals
    mesh.visual = TextureVisuals(material=material(color, roughness))
    return mesh


def build_parametric_sofa(width: float, height: float, depth: float, spec: SofaSpec) -> bytes:
    """Meters, Y-up, bottom-center pivot, back faces -Z. No geometry scale at export."""
    if min(width, height, depth) <= 0:
        raise ValueError("Sofa dimensions must be positive")
    arm = width * (0.09 if spec.arms == "slim" else 0.15)
    inside = width - arm * 2
    feet = height * (0.17 if spec.template == "legs" else 0.035)
    base_h, seat_h, back_d = height * 0.18, height * 0.18, depth * 0.19
    roughness = 0.92 if spec.material == "fabric" else 0.42
    parts = {}

    def padded(name, size, center):
        parts[name] = _cushion(size, center, spec.color, roughness)

    if spec.template == "legs":
        leg_w = min(width * 0.035, depth * 0.09)
        for ix, x in enumerate((-width / 2 + arm / 2, width / 2 - arm / 2)):
            for iz, z in enumerate((-depth * 0.38, depth * 0.38)):
                parts[f"leg_{ix}_{iz}"] = box((leg_w, feet, leg_w), (x, feet / 2, z), "#493B30")
    else:
        parts["plinth"] = box((width * 0.93, feet, depth * 0.93), (0, feet / 2, 0), "#423D37")
    padded("base", (width, base_h, depth), (0, feet + base_h / 2, 0))
    bottom = feet + base_h
    arm_h = height * 0.68 - bottom
    for index, x in enumerate((-width / 2 + arm / 2, width / 2 - arm / 2)):
        padded(f"arm_{index}", (arm, arm_h, depth), (x, bottom + arm_h / 2, 0))
    gap = min(0.015, inside * 0.015)
    seat_w = (inside - gap * (spec.cushions + 1)) / spec.cushions
    for index in range(spec.cushions):
        x = -inside / 2 + gap + seat_w / 2 + index * (seat_w + gap)
        padded(
            f"seat_{index}", (seat_w, seat_h, depth - back_d), (x, bottom + seat_h / 2, back_d / 2)
        )
        back_h = height - bottom
        padded(
            f"back_{index}",
            (seat_w, back_h, back_d),
            (x, bottom + back_h / 2, -depth / 2 + back_d / 2),
        )
    for name, mesh in parts.items():
        if name.startswith("leg_") or name == "plinth":
            mesh.unmerge_vertices()
            mesh.vertex_normals = np.repeat(mesh.face_normals, 3, axis=0)
    return export_glb(parts, include_normals=True)
