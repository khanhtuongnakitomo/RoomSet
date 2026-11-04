"""Convert three predicted floor points to a metric, right-handed corner draft."""

import numpy as np

from app.domain.reconstruction import ReconstructionResult


def fit_corner(anchors: list, reference_width_m: float, point_count: int) -> ReconstructionResult:
    points = np.asarray(anchors, dtype=float)
    if points.shape != (3, 3) or not np.isfinite(points).all():
        raise ValueError("The model did not produce three valid floor points.")
    origin, end_a, end_b = points
    a, b = end_a - origin, end_b - origin
    length_a, length_b = np.linalg.norm(a), np.linalg.norm(b)
    if min(length_a, length_b) < 1e-5:
        raise ValueError("The floor markers are too close together.")
    cosine = float(np.clip(np.dot(a, b) / (length_a * length_b), -1, 1))
    angle = float(np.degrees(np.arccos(cosine)))
    if not 75 <= angle <= 105:
        raise ValueError(
            "This draft does not look like a right-angle corner. "
            "Correct the markers or use measured-room mode."
        )
    axis_x = a / length_a
    along_b = b - np.dot(b, axis_x) * axis_x
    depth = float(np.linalg.norm(along_b) * reference_width_m / length_a)
    return ReconstructionResult(
        width_m=round(reference_width_m, 3),
        depth_m=round(depth, 3),
        angle_degrees=round(angle, 1),
        point_count=point_count,
        notes=[
            "Photo depth plus your three floor markers and measured wall A length.",
            "Check wall B with a tape measure. Scale alone cannot remove depth distortion.",
            "Only the marked rectangular corner is modeled. Objects must be added separately.",
        ],
    )
