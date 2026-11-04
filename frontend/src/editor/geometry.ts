// Pure placement math with no Three.js, so it stays unit-tested.

import type { Obstacle, Placement, SceneV1, Vec2, Wall } from "../api/contracts";

const EPSILON = 1e-6;

/** Same convention as Three.js rotation.y: local (x, z) to world. */
export function footprint(width: number, depth: number, { position, yaw }: Placement): Vec2[] {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const corners: Vec2[] = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ];
  return corners.map(([x, z]) => [position[0] + x * cos + z * sin, position[1] - x * sin + z * cos]);
}

/** Separating axis test for convex polygons. Touching does not count as overlap. */
export function polygonsOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i += 1) {
      const [x1, z1] = polygon[i];
      const [x2, z2] = polygon[(i + 1) % polygon.length];
      const axis: Vec2 = [z1 - z2, x2 - x1];
      const project = (points: Vec2[]) => points.map(([x, z]) => x * axis[0] + z * axis[1]);
      const pa = project(a);
      const pb = project(b);
      if (Math.max(...pa) <= Math.min(...pb) + EPSILON || Math.max(...pb) <= Math.min(...pa) + EPSILON) {
        return false;
      }
    }
  }
  return true;
}

function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

export function polygonDistance(a: Vec2[], b: Vec2[]): number {
  if (polygonsOverlap(a, b)) return 0;
  let best = Infinity;
  for (const [from, to] of [[a, b], [b, a]]) {
    for (const point of from) {
      for (let i = 0; i < to.length; i += 1) {
        best = Math.min(best, pointSegmentDistance(point, to[i], to[(i + 1) % to.length]));
      }
    }
  }
  return best;
}

export function wallPolygon(wall: Wall): Vec2[] {
  const [dx, dz] = [wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]];
  const length = Math.hypot(dx, dz);
  // The room side is (-dz, dx), so thickness extends the opposite way.
  const [ox, oz] = [(dz / length) * wall.thickness, (-dx / length) * wall.thickness];
  return [wall.start, wall.end, [wall.end[0] + ox, wall.end[1] + oz], [wall.start[0] + ox, wall.start[1] + oz]];
}

/**
 * Pushes the sofa back to the room side of every wall it crosses, so it slides along walls instead of
 * passing through them. Rooms are a corner of a rectangular floor, so a wall's whole line is the room's
 * edge: this also catches a fast drag that jumped the sofa past a wall, or around its end, in one move.
 */
export function keepInsideWalls(scene: SceneV1, placement: Placement): Placement {
  const [width, , depth] = scene.furniture.dimensions;
  let [x, z] = placement.position;
  // Two passes settle a corner where pushing off one wall moves the sofa into the other.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const wall of scene.walls) {
      const [dx, dz] = [wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]];
      const length = Math.hypot(dx, dz);
      if (length < EPSILON) continue;
      const inward: Vec2 = [-dz / length, dx / length];
      const corners = footprint(width, depth, { position: [x, z], yaw: placement.yaw });
      const deepest = Math.min(...corners.map(([cx, cz]) => (cx - wall.start[0]) * inward[0] + (cz - wall.start[1]) * inward[1]));
      if (deepest >= 0) continue;
      x -= inward[0] * deepest;
      z -= inward[1] * deepest;
    }
  }
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return { position: [round(x), round(z)], yaw: placement.yaw };
}

export function obstaclePolygon(obstacle: Obstacle): Vec2[] {
  const [width, , depth] = obstacle.size;
  return footprint(width, depth, { position: obstacle.center, yaw: obstacle.yaw });
}

function pointInPolygon([x, z]: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export interface PlacementCheck {
  overlaps: string[];
  /** Part of the sofa is outside the captured floor, where we know nothing. */
  outsideCaptured: boolean;
  nearest: { label: string; distance: number } | null;
}

export function checkPlacement(scene: SceneV1, placement: Placement): PlacementCheck {
  const [width, , depth] = scene.furniture.dimensions;
  const sofa = footprint(width, depth, placement);
  const items = [
    ...scene.walls.map((wall) => ({ label: wall.id === "wall_a" ? "wall A" : wall.id === "wall_b" ? "wall B" : wall.id, polygon: wallPolygon(wall) })),
    ...scene.obstacles.map((obstacle) => ({ label: obstacle.label, polygon: obstaclePolygon(obstacle) })),
  ];
  const overlaps: string[] = [];
  let nearest: PlacementCheck["nearest"] = null;
  for (const { label, polygon } of items) {
    if (polygonsOverlap(sofa, polygon)) {
      overlaps.push(label);
      continue;
    }
    const distance = polygonDistance(sofa, polygon);
    if (!nearest || distance < nearest.distance) nearest = { label, distance };
  }
  return {
    overlaps,
    outsideCaptured: sofa.some((corner) => !pointInPolygon(corner, scene.floor) && !onBoundary(corner, scene.floor)),
    nearest,
  };
}

function onBoundary(point: Vec2, polygon: Vec2[]): boolean {
  return polygon.some((a, i) => pointSegmentDistance(point, a, polygon[(i + 1) % polygon.length]) < 1e-3);
}
