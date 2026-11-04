// Mirrors backend/app/domain. contracts/fixtures/scene.fixture.json is tested on both sides.

export type Vec2 = [number, number];

export interface Wall { id: string; start: Vec2; end: Vec2; height: number; thickness: number }
export interface Obstacle { id: string; label: string; center: Vec2; size: [number, number, number]; yaw: number; kind?: "solid" | "keep_clear" }
export interface Placement { position: Vec2; yaw: number }

export interface SceneV1 {
  schema_version: "scene.v1";
  units: "meters";
  up: "Y";
  floor: Vec2[];
  walls: Wall[];
  obstacles: Obstacle[];
  calibration: { status: "calibrated" | "estimated"; method: string; reference_distance_m: number | null };
  provenance: {
    method: "automatic" | "assisted" | "sample" | "photo_assisted";
    builder: string;
    reconstruction_model: string | null;
    created_at: string;
    notes: string[];
  };
  furniture: {
    id: string;
    name: string;
    dimensions: [number, number, number]; // width, height, depth
    is_proxy: boolean;
    placement: Placement;
  };
  assets: { room: string; furniture: string };
  source_photos: string[];
  warnings: string[];
}

export interface MeasuredField {
  value_m: number | null;
  source: "listing_data" | "listing_ai" | "screenshot_ai" | "user" | "missing";
  confidence: "high" | "medium" | "low" | null;
  confirmed_by_user?: boolean;
  extracted_value_m?: number | null;
  extracted_source?: string | null;
}

export interface SofaSpec {
  template: "legs" | "plinth";
  cushions: number;
  arms: "slim" | "wide";
  color: string;
  material: "fabric" | "leather";
}

export interface ProductVersion {
  name: string;
  width_m: number;
  depth_m: number;
  height_m: number;
  geometry: SofaSpec;
  source_url: string | null;
}

export interface ProductDraft {
  source_url: string | null;
  name: string | null;
  width: MeasuredField;
  depth: MeasuredField;
  height: MeasuredField;
  image_urls: string[];
  appearance: string | null;
  notes: string[];
  geometry?: SofaSpec;
  geometry_source?: "default" | "ai" | "user";
  reference_asset?: string | null;
}

export interface Product extends ProductDraft { confirmed: boolean; previous_versions?: ProductVersion[] }

export type PhotoFlag = "blurry" | "too_dark" | "duplicate";
export interface PhotoView {
  id: string;
  width: number;
  height: number;
  quality: { flags: PhotoFlag[]; duplicate_of: string | null };
}

export interface Clarification {
  id: string;
  question: string;
  help: string | null;
  answer_type: "number" | "boolean" | "text" | "obstacles";
  affected_field: string;
  blocking: boolean;
  unit: string | null;
  origin: "rules" | "ai";
}

export interface ObstacleAnswer { label: string; width_m: number; depth_m: number; height_m: number; x_m: number; z_m: number; kind?: "solid" | "keep_clear" }
export interface RoomAnswers {
  reconstruction_id?: string | null;
  room_width_m: number;
  room_depth_m: number;
  ceiling_height_m: number | null;
  dimensions_measured: boolean;
  obstacles: ObstacleAnswer[];
  notes: string | null;
}

export type SessionStatus = "collecting" | "checking" | "needs_input" | "reconstructing" | "building" | "ready" | "failed";

export interface RenderView { id: string; asset: string; style_prompt: string; label: string }

export interface SessionView {
  reconstruction?: ReconstructionView | null;
  id: string;
  status: SessionStatus;
  product: Product | null;
  photos: PhotoView[];
  coverage: { overlap: string; semantic_same_area: boolean | null; retake_instructions: string[] } | null;
  clarifications: Clarification[];
  answers: RoomAnswers | null;
  scene: SceneV1 | null;
  placement: Placement | null;
  renders: RenderView[];
  error: { code: string; message: string; retryable: boolean } | null;
}

export interface ReconstructionRequest {
  photo_id: string;
  corner: Vec2;
  wall_a: Vec2;
  wall_b: Vec2;
  reference_width_m: number;
}
export interface ReconstructionView {
  id: string;
  status: "running" | "ready" | "failed";
  attempts: number;
  photo_ids: string[];
  request: ReconstructionRequest;
  result: { width_m: number; depth_m: number; angle_degrees: number; point_count: number; model: string; notes: string[] } | null;
  error: string | null;
}

export interface Capabilities {
  product_ai: boolean;
  style_render: boolean;
  scene_builder: string;
  reconstruction: string;
  max_photos: number;
  min_photos: number;
  /** Voice assistant on /ar: needs both speech and Muse Spark keys. Older servers omit it. */
  assistant?: boolean;
}

export interface AssistantSuggestion {
  kind: "set" | "piece";
  id: string;
  reason: string;
}

export interface AssistantHeard {
  question: string;
  language: string | null;
  timings_ms: Record<string, number>;
}

export interface AssistantReply {
  question: string;
  language: string | null;
  answer: string;
  seen: string[];
  suggestions: AssistantSuggestion[];
  model: string;
  timings_ms: Record<string, number>;
}

/** Rejects a scene that breaks the geometric contract, before the editor touches it. */
export function assertSceneV1(value: unknown): asserts value is SceneV1 {
  const scene = value as SceneV1;
  const problem =
    scene?.schema_version !== "scene.v1" ? "schema_version"
    : scene.units !== "meters" ? "units"
    : scene.up !== "Y" ? "up"
    : !Array.isArray(scene.floor) || scene.floor.length < 3 ? "floor"
    : !Array.isArray(scene.walls) ? "walls"
    : scene.furniture?.dimensions?.length !== 3 || scene.furniture.dimensions.some((d) => !(d > 0)) ? "furniture.dimensions"
    : !["automatic", "assisted", "sample", "photo_assisted"].includes(scene.provenance?.method) ? "provenance.method"
    : null;
  if (problem) throw new Error(`Scene contract violation: ${problem}`);
}
