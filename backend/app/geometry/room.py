"""Deterministic room geometry from a Scene v1 description. No model output runs as code."""

import math

from app.domain.clarification import RoomAnswers
from app.domain.scene import Obstacle, Wall
from app.geometry.meshes import box, export_glb

FLOOR = "#D8D3C7"
WALL = "#F7F4ED"
OBSTACLE = "#929B80"
WALL_THICKNESS = 0.1
FLOOR_THICKNESS = 0.02
DEFAULT_CEILING_M = 2.6


def assisted_layout(answers: RoomAnswers) -> tuple[list, list[Wall], list[Obstacle]]:
    """One corner at the origin. Wall A runs along +X, wall B along +Z. The other sides are open."""
    width, depth = answers.room_width_m, answers.room_depth_m
    height = answers.ceiling_height_m or DEFAULT_CEILING_M
    floor = [(0.0, 0.0), (width, 0.0), (width, depth), (0.0, depth)]
    walls = [
        Wall(
            id="wall_a", start=(0.0, 0.0), end=(width, 0.0), height=height, thickness=WALL_THICKNESS
        ),
        Wall(
            id="wall_b", start=(0.0, depth), end=(0.0, 0.0), height=height, thickness=WALL_THICKNESS
        ),
    ]
    obstacles = [
        Obstacle(
            id=f"obstacle_{index}",
            label=item.label,
            kind=item.kind,
            center=(item.x_m, item.z_m),
            size=(item.width_m, item.height_m, item.depth_m),
        )
        for index, item in enumerate(answers.obstacles)
    ]
    return floor, walls, obstacles


def build_room_glb(floor: list, walls: list[Wall], obstacles: list[Obstacle]) -> bytes:
    xs = [p[0] for p in floor]
    zs = [p[1] for p in floor]
    parts = {
        "floor": box(
            (max(xs) - min(xs), FLOOR_THICKNESS, max(zs) - min(zs)),
            ((max(xs) + min(xs)) / 2, -FLOOR_THICKNESS / 2, (max(zs) + min(zs)) / 2),
            FLOOR,
        )
    }
    for wall in walls:
        dx, dz = wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]
        length = math.hypot(dx, dz)
        ux, uz = dx / length, dz / length
        # Room side is (-uz, ux); thickness extends the opposite way.
        cx = (wall.start[0] + wall.end[0]) / 2 + uz * wall.thickness / 2
        cz = (wall.start[1] + wall.end[1]) / 2 - ux * wall.thickness / 2
        parts[wall.id] = box(
            (length, wall.height, wall.thickness),
            (cx, wall.height / 2, cz),
            WALL,
            yaw=math.atan2(-uz, ux),
        )
    for item in obstacles:
        width, height, depth = item.size
        parts[item.id] = box(
            (width, 0.015 if item.kind == "keep_clear" else height, depth),
            (item.center[0], 0.012 if item.kind == "keep_clear" else height / 2, item.center[1]),
            "#D9AA57" if item.kind == "keep_clear" else OBSTACLE,
            yaw=item.yaw,
        )
    return export_glb(parts)
