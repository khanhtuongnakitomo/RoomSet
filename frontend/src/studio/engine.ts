// Studio 3D. Each room is a real box at measured size, and its 360° photo is projected onto the walls,
// floor and ceiling from the point it was shot. That makes it a true 3D space: walk the camera around,
// look from above, and furniture stands in the room. Walls facing away from the viewer are not drawn,
// so a room opens up as you orbit. Renders on demand only: an idle studio draws nothing.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { itemPolygon, measureItem, roomAt } from "./analysis";
import { APARTMENT, CATALOG_BY_ID, HALL_WIDTH, ROOMS, ROOM_BY_ID, ROOM_HEIGHT, clampToRoom, type PlacedItem, type Room } from "./apartment";

export type StudioMode = "room" | "model" | "plan";

export interface StudioEvents {
  onSelect: (uid: string | null) => void;
  onItemsChange: (items: PlacedItem[], final: boolean) => void;
  onProgress: (loaded: number, total: number) => void;
  onContextLost: () => void;
}

const BACKGROUND = 0x1d2e26;
const TOUCH = window.matchMedia("(pointer: coarse)").matches;
const TAP_SLOP_PX = 10;
const SHEET_CLEARANCE_PX = 72;
const CAP_COLOR = 0xf7f4ed;
const SELECT = 0xc66b48;
const BLOCKED = 0x9d3e35;
const MODEL_WALL_HEIGHT = 1.45;
/** Inside a room the camera keeps this far from the walls, floor and ceiling, so it never sees through them. */
const ROOM_CAMERA_INSET = 0.2;
/** Sideways view a room should show, in degrees. Matches a 62° lens on a 16:10 screen. */
const ROOM_VIEW_WIDTH_DEG = 88;

const ROOM_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ROOM_FRAGMENT = /* glsl */ `
  uniform sampler2D photo;
  uniform vec3 capture;
  uniform float cosRot;
  uniform float sinRot;
  uniform float clipY;
  varying vec3 vWorld;
  const float PI = 3.14159265358979;
  void main() {
    if (vWorld.y > clipY) discard;
    vec3 d = normalize(vWorld - capture);
    float x = d.x * cosRot - d.z * sinRot;
    float z = d.x * sinRot + d.z * cosRot;
    vec2 uv = vec2(0.5 + atan(z, x) / (2.0 * PI), 0.5 + asin(clamp(d.y, -1.0, 1.0)) / PI);
    gl_FragColor = vec4(texture2D(photo, uv).rgb, 1.0);
  }
`;

interface Live {
  group: THREE.Group;
  proxy: THREE.Mesh;
}

function softShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.filter = "blur(9px)";
  context.fillStyle = "rgba(18, 14, 10, 0.9)";
  context.fillRect(16, 16, 96, 96);
  return new THREE.CanvasTexture(canvas);
}

function rugTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 360;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#a59c8b";
  c.fillRect(0, 0, 512, 360);
  c.strokeStyle = "#7c7362";
  c.lineWidth = 3;
  c.strokeRect(22, 22, 468, 316);
  c.strokeRect(34, 34, 444, 292);
  for (let y = 0; y < 360; y += 2) {
    c.fillStyle = `rgba(70, 58, 44, ${0.02 + (((y * 31) % 7) / 7) * 0.05})`;
    c.fillRect(0, y, 512, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class StudioEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private perspective = new THREE.PerspectiveCamera(52, 1, 0.05, 120);
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
  private camera: THREE.Camera = this.perspective;
  private controls: OrbitControls;
  private furniture = new THREE.Group();
  private sun = new THREE.DirectionalLight(0xfff2e2, 1.1);
  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private loader = new GLTFLoader();
  private templates = new Map<string, Promise<THREE.Object3D>>();
  private shadowTexture = softShadowTexture();
  private live = new Map<string, Live>();
  private items: PlacedItem[] = [];
  private selected: string | null = null;
  private outline: THREE.LineLoop;
  private outlineMaterial = new THREE.LineBasicMaterial({ color: SELECT, depthTest: false, transparent: true });
  private roomMaterials: THREE.ShaderMaterial[] = [];
  private caps: THREE.Mesh[] = [];
  private labels: { element: HTMLElement; position: THREE.Vector3 }[] = [];
  private press: { x: number; y: number; uid: string | null; offset: THREE.Vector3 | null; dragging: boolean } | null = null;
  private mode: StudioMode = "room";
  private room: Room = ROOMS[0];
  private frame = 0;
  private observer: ResizeObserver;
  private disposed = false;
  private roomPhotos: Promise<void>[] = [];
  /** Nothing is drawn until prepare() has the whole first view on the GPU. */
  private holding = true;
  private lift = 0;
  private liftTarget = 0;
  private lifting = 0;

  constructor(private container: HTMLElement, private events: StudioEvents) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOUCH ? 1.6 : 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(BACKGROUND);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.radius = 5;
    Object.assign(this.sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 30 });
    this.sun.position.set(APARTMENT.width + 2.5, 13, APARTMENT.depth / 2 - 1.5);
    this.sun.target.position.set(APARTMENT.width / 2, 0, APARTMENT.depth / 2);
    this.scene.add(this.sun, this.sun.target, this.furniture);

    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(APARTMENT.width - HALL_WIDTH, APARTMENT.depth).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.26, color: 0x17110c }));
    catcher.position.set((APARTMENT.width + HALL_WIDTH) / 2, 0.003, APARTMENT.depth / 2);
    catcher.receiveShadow = true;
    this.scene.add(catcher);

    this.outline = new THREE.LineLoop(new THREE.BufferGeometry(), this.outlineMaterial);
    this.outline.renderOrder = 10;
    this.outline.visible = false;
    this.scene.add(this.outline);

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);

    this.controls = new OrbitControls(this.perspective, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.015;
    this.controls.addEventListener("change", this.invalidate);

    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    this.buildRooms();
    this.resize();
  }

  /** Lighting comes from a real room photo, so furniture sits in the same light as the walls. */
  async loadLighting(): Promise<void> {
    const hdr = await new RGBELoader().loadAsync("/studio/rooms/environment.hdr");
    if (this.disposed) return;
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromEquirectangular(hdr).texture;
    this.scene.environmentIntensity = 1.05;
    hdr.dispose();
    pmrem.dispose();
    this.invalidate();
  }

  /** Loads the first view fully onto the GPU, so the page opens on a finished picture instead of hitching. */
  async prepare(mode: StudioMode): Promise<void> {
    await Promise.all(this.roomPhotos);
    if (this.disposed) return;
    this.setMode(mode);
    await this.renderer.compileAsync(this.scene, this.camera);
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((node) => {
      const { material } = node as THREE.Mesh;
      for (const entry of Array.isArray(material) ? material : material ? [material] : []) {
        const shader = entry as THREE.ShaderMaterial;
        const values = [...Object.values(entry), ...Object.values(shader.uniforms ?? {}).map((uniform) => uniform.value)];
        for (const value of values) if ((value as THREE.Texture | null)?.isTexture) textures.add(value as THREE.Texture);
      }
    });
    for (const texture of textures) {
      if (this.disposed) return;
      this.renderer.initTexture(texture);
      await new Promise(requestAnimationFrame);
    }
    if (this.disposed) return;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    // GPU work runs after this call returns. Reading a pixel waits for it, so the cost lands behind the loading screen.
    const gl = this.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    await new Promise(requestAnimationFrame);
    if (this.disposed) return;
    this.holding = false;
    this.renderer.render(this.scene, this.camera);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    await new Promise(requestAnimationFrame);
  }

  registerLabel(element: HTMLElement, x: number, z: number): void {
    this.labels.push({ element, position: new THREE.Vector3(x, 0.05, z) });
    this.invalidate();
  }

  clearLabels(): void {
    this.labels = [];
  }

  setMode(mode: StudioMode, roomId?: string): void {
    this.clearLift();
    this.mode = mode;
    if (roomId) this.room = ROOM_BY_ID.get(roomId) ?? this.room;
    this.setWallHeight(mode === "room" ? ROOM_HEIGHT + 1 : MODEL_WALL_HEIGHT);
    const aspect = this.container.clientWidth / Math.max(this.container.clientHeight, 1);

    if (mode === "plan") {
      const center = new THREE.Vector3(APARTMENT.width / 2, 0, APARTMENT.depth / 2);
      this.camera = this.ortho;
      this.ortho.zoom = 1;
      this.ortho.position.set(center.x, 30, center.z);
      this.ortho.up.set(0, 0, -1);
      this.ortho.lookAt(center);
      this.controls.object = this.ortho;
      this.controls.enableRotate = false;
      this.controls.target.copy(center);
    } else if (mode === "model") {
      const center = new THREE.Vector3(APARTMENT.width / 2, 0.4, APARTMENT.depth / 2);
      // A tall screen looks along the apartment's short side, so its length fills the height.
      const direction = aspect < 1 ? new THREE.Vector3(0.2, 0.86, 0.47) : new THREE.Vector3(0.62, 0.76, 0.34);
      this.camera = this.perspective;
      this.perspective.fov = aspect < 1 ? 46 : 40;
      this.perspective.aspect = aspect;
      this.perspective.position.copy(center).addScaledVector(direction, this.fitDistance(center, direction));
      this.controls.object = this.perspective;
      this.controls.enableRotate = true;
      this.controls.target.copy(center);
    } else {
      const [minX, maxX, minZ, maxZ] = this.room.rect;
      const middleZ = (minZ + maxZ) / 2;
      this.camera = this.perspective;
      // A tall screen cannot step back without leaving the room, so it sees more by widening the lens.
      const wide = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(ROOM_VIEW_WIDTH_DEG / 2)) / aspect));
      this.perspective.fov = THREE.MathUtils.clamp(wide, 62, 88);
      // Standing at the window end, eye height, looking down the room's length.
      this.perspective.position.set(maxX - ROOM_CAMERA_INSET, 1.5, middleZ + 0.08);
      this.controls.object = this.perspective;
      this.controls.enableRotate = true;
      this.controls.target.set(minX + 1.5, 0.75, middleZ - 0.05);
    }
    this.keepCameraInRoom();
    this.perspective.updateProjectionMatrix();
    this.resize();
    this.controls.update();
    this.renderer.shadowMap.needsUpdate = true;
    this.invalidate();
  }

  /** The nearest camera distance that keeps the whole apartment clear of the screen edges and controls. */
  private fitDistance(center: THREE.Vector3, direction: THREE.Vector3): number {
    const probe = this.perspective.clone();
    const corners = [0, APARTMENT.width].flatMap((x) => [0, APARTMENT.depth].flatMap((z) => [0, MODEL_WALL_HEIGHT].map((y) => new THREE.Vector3(x, y, z))));
    const fits = (distance: number) => {
      probe.position.copy(center).addScaledVector(direction, distance);
      probe.lookAt(center);
      probe.updateMatrixWorld();
      probe.updateProjectionMatrix();
      return corners.every((corner) => {
        const point = corner.clone().project(probe);
        return Math.abs(point.x) < 0.94 && Math.abs(point.y) < 0.76;
      });
    };
    let near = 4;
    let far = this.controls.maxDistance;
    for (let step = 0; step < 18; step += 1) {
      const middle = (near + far) / 2;
      if (fits(middle)) far = middle;
      else near = middle;
    }
    return far;
  }

  /** Slides the picture up so a selected piece is not hidden behind a phone sheet. Null clears it. */
  revealAbove(uid: string | null, sheetTop: number | null): void {
    const item = this.items.find((entry) => entry.uid === uid);
    let target = 0;
    if (item && sheetTop !== null) {
      const height = this.container.clientHeight;
      const y = ((1 - new THREE.Vector3(item.x, 0.3, item.z).project(this.camera).y) / 2) * height + this.lift;
      target = THREE.MathUtils.clamp(y - (sheetTop - SHEET_CLEARANCE_PX), 0, height * 0.45);
    }
    if (target === this.liftTarget) return;
    this.liftTarget = target;
    cancelAnimationFrame(this.lifting);
    const step = () => {
      if (this.disposed) return;
      this.lift += (this.liftTarget - this.lift) * 0.2;
      if (Math.abs(this.liftTarget - this.lift) < 0.5) this.lift = this.liftTarget;
      this.applyLift();
      this.invalidate();
      if (this.lift !== this.liftTarget) this.lifting = requestAnimationFrame(step);
    };
    this.lifting = requestAnimationFrame(step);
  }

  private applyLift(): void {
    const { clientWidth: width, clientHeight: height } = this.container;
    const camera = this.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    if (this.lift) camera.setViewOffset(width, height, 0, this.lift, width, height);
    else camera.clearViewOffset();
  }

  private clearLift(): void {
    cancelAnimationFrame(this.lifting);
    this.lift = 0;
    this.liftTarget = 0;
    this.perspective.clearViewOffset();
    this.ortho.clearViewOffset();
  }

  /** Reconciles the scene with a layout, reusing what is already loaded. */
  async setItems(items: PlacedItem[]): Promise<void> {
    this.items = items;
    const wanted = new Set(items.map((item) => item.uid));
    for (const [uid, live] of this.live) {
      if (!wanted.has(uid)) {
        this.furniture.remove(live.group);
        this.live.delete(uid);
      }
    }
    const missing = items.filter((item) => !this.live.has(item.uid));
    let loaded = items.length - missing.length;
    this.events.onProgress(loaded, items.length);
    await Promise.all(
      missing.map(async (item) => {
        const live = await this.buildItem(item);
        loaded += 1;
        this.events.onProgress(loaded, items.length);
        if (this.disposed || !this.items.some((current) => current.uid === item.uid) || this.live.has(item.uid)) return;
        this.live.set(item.uid, live);
        this.furniture.add(live.group);
      }),
    );
    this.syncTransforms();
    this.select(this.selected && wanted.has(this.selected) ? this.selected : null);
    this.renderer.shadowMap.needsUpdate = true;
    this.invalidate();
  }

  select(uid: string | null): void {
    if (uid !== this.selected) {
      this.selected = uid;
      this.events.onSelect(uid);
    }
    this.refreshOutline();
    this.invalidate();
  }

  frameItem(uid: string): void {
    const item = this.items.find((entry) => entry.uid === uid);
    if (!item) return;
    this.select(uid);
    this.controls.target.set(item.x, 0.5, item.z);
    this.controls.update();
    this.invalidate();
  }

  zoomBy(delta: number): void {
    if (this.mode === "plan") {
      this.ortho.zoom = THREE.MathUtils.clamp(this.ortho.zoom * (1 - delta * 0.04), 0.6, 4);
      this.ortho.updateProjectionMatrix();
    } else {
      const offset = this.perspective.position.clone().sub(this.controls.target);
      offset.multiplyScalar(1 + delta * 0.04);
      offset.setLength(THREE.MathUtils.clamp(offset.length(), this.controls.minDistance, this.controls.maxDistance));
      this.perspective.position.copy(this.controls.target).add(offset);
      this.keepCameraInRoom();
    }
    this.invalidate();
  }

  /**
   * In a room the camera orbits on the inside: when a swipe or zoom would carry it through a wall, it stops
   * at the wall on the line toward its target instead. Other views look from outside, so they are left alone.
   */
  private keepCameraInRoom(): void {
    if (this.mode !== "room") return;
    const [minX, maxX, minZ, maxZ] = this.room.rect;
    const low = new THREE.Vector3(minX + ROOM_CAMERA_INSET, 0.35, minZ + ROOM_CAMERA_INSET);
    const high = new THREE.Vector3(maxX - ROOM_CAMERA_INSET, ROOM_HEIGHT - 0.15, maxZ - ROOM_CAMERA_INSET);
    const target = this.controls.target.clamp(low, high);
    const position = this.perspective.position;
    if (position.x >= low.x && position.x <= high.x && position.y >= low.y && position.y <= high.y && position.z >= low.z && position.z <= high.z) return;
    const direction = position.clone().sub(target);
    let reach = direction.length();
    direction.normalize();
    for (const axis of ["x", "y", "z"] as const) {
      if (direction[axis] > 1e-6) reach = Math.min(reach, (high[axis] - target[axis]) / direction[axis]);
      if (direction[axis] < -1e-6) reach = Math.min(reach, (low[axis] - target[axis]) / direction[axis]);
    }
    position.copy(target).addScaledVector(direction, Math.max(reach, 0.05));
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("webglcontextlost", this.onContextLost);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      mesh.geometry?.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) {
        // Phones run out of GPU memory across page changes unless textures go too.
        const shader = material as THREE.ShaderMaterial;
        const values = [...Object.values(material), ...Object.values(shader.uniforms ?? {}).map((uniform) => uniform.value)];
        for (const value of values) if ((value as THREE.Texture | null)?.isTexture) (value as THREE.Texture).dispose();
        material.dispose();
      }
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }

  private buildRooms(): void {
    for (const room of ROOMS) {
      const [minX, maxX, minZ, maxZ] = room.rect;
      let settled = () => {};
      this.roomPhotos.push(new Promise((resolve) => { settled = resolve; }));
      const texture = new THREE.TextureLoader().load(`/studio/rooms/${room.pano}.jpg`, () => { settled(); this.invalidate(); }, undefined, () => settled());
      // Sampling by direction has a seam, so this samples the full-size photo without mipmaps.
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = THREE.RepeatWrapping;
      texture.colorSpace = THREE.NoColorSpace;
      const material = new THREE.ShaderMaterial({
        vertexShader: ROOM_VERTEX,
        fragmentShader: ROOM_FRAGMENT,
        side: THREE.BackSide,
        toneMapped: false,
        uniforms: {
          photo: { value: texture },
          capture: { value: new THREE.Vector3(room.origin[0], room.captureHeight, room.origin[1]) },
          cosRot: { value: Math.cos(room.photoRotation) },
          sinRot: { value: Math.sin(room.photoRotation) },
          clipY: { value: ROOM_HEIGHT + 1 },
        },
      });
      this.roomMaterials.push(material);
      const box = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, ROOM_HEIGHT, maxZ - minZ), material);
      box.position.set((minX + maxX) / 2, ROOM_HEIGHT / 2, (minZ + maxZ) / 2);
      this.scene.add(box);
      this.addCaps(room);
    }
    const hall = new THREE.Mesh(
      new THREE.PlaneGeometry(HALL_WIDTH, APARTMENT.depth).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x8c8678, roughness: 0.9 }),
    );
    hall.position.set(HALL_WIDTH / 2, -0.002, APARTMENT.depth / 2);
    this.scene.add(hall);
  }

  /** Thin wall tops that read as a section line when you look down into a room. */
  private addCaps(room: Room): void {
    const [minX, maxX, minZ, maxZ] = room.rect;
    const material = new THREE.MeshBasicMaterial({ color: CAP_COLOR, toneMapped: false });
    const T = 0.08;
    const add = (width: number, depth: number, x: number, z: number) => {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(width, 0.015, depth), material);
      cap.position.set(x, MODEL_WALL_HEIGHT, z);
      cap.visible = false;
      this.caps.push(cap);
      this.scene.add(cap);
    };
    add(maxX - minX + T, T, (minX + maxX) / 2, minZ);
    add(maxX - minX + T, T, (minX + maxX) / 2, maxZ);
    add(T, maxZ - minZ + T, minX, (minZ + maxZ) / 2);
    add(T, maxZ - minZ + T, maxX, (minZ + maxZ) / 2);
  }

  private setWallHeight(height: number): void {
    for (const material of this.roomMaterials) material.uniforms.clipY.value = height;
    for (const cap of this.caps) cap.visible = this.mode !== "room";
  }

  private syncTransforms(): void {
    for (const item of this.items) {
      const live = this.live.get(item.uid);
      if (!live) continue;
      live.group.position.set(item.x, CATALOG_BY_ID.get(item.catalogId)?.lift ?? 0, item.z);
      live.group.rotation.y = item.yaw;
    }
  }

  private template(model: string): Promise<THREE.Object3D> {
    let template = this.templates.get(model);
    if (!template) {
      template = this.loader.loadAsync(`/studio/models/${model}.glb`).then((gltf) => {
        gltf.scene.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        const holder = new THREE.Group();
        gltf.scene.position.set(-center.x, -box.min.y, -center.z);
        holder.add(gltf.scene);
        return holder;
      });
      this.templates.set(model, template);
    }
    return template;
  }

  private async buildItem(item: PlacedItem): Promise<Live> {
    const data = CATALOG_BY_ID.get(item.catalogId)!;
    const group = new THREE.Group();
    const [width, depth, height] = data.size;
    if (data.model) {
      const instance = (await this.template(data.model)).clone(true);
      instance.rotation.y = ((data.yawOffset ?? 0) * Math.PI) / 180;
      group.add(instance);
      if (data.lift === undefined) {
        const shadow = new THREE.Mesh(
          new THREE.PlaneGeometry(width * 1.14, depth * 1.14).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
        );
        shadow.position.y = 0.006;
        shadow.raycast = () => undefined;
        group.add(shadow);
      }
    } else {
      const rug = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 0.95 }));
      rug.position.y = height / 2;
      rug.receiveShadow = true;
      group.add(rug);
    }
    // A simple invisible box is what clicks test against, which keeps picking instant.
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(width, Math.max(height, 0.03), depth), new THREE.MeshBasicMaterial());
    proxy.position.y = Math.max(height, 0.03) / 2;
    proxy.visible = false;
    proxy.userData.uid = item.uid;
    group.add(proxy);
    return { group, proxy };
  }

  private refreshOutline(): void {
    const item = this.items.find((entry) => entry.uid === this.selected);
    if (!item) {
      this.outline.visible = false;
      return;
    }
    this.outline.geometry.setFromPoints(itemPolygon(item).map(([x, z]) => new THREE.Vector3(x, 0.02, z)));
    this.outlineMaterial.color.setHex(measureItem(item, this.items).overlaps.length ? BLOCKED : SELECT);
    this.outline.visible = true;
  }

  private invalidate = () => {
    if (this.disposed || this.holding) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const moving = this.controls.update();
      this.keepCameraInRoom();
      this.renderer.render(this.scene, this.camera);
      this.placeLabels();
      if (moving) this.invalidate();
    });
  };

  private placeLabels(): void {
    const { clientWidth: width, clientHeight: height } = this.container;
    const point = new THREE.Vector3();
    for (const { element, position } of this.labels) {
      point.copy(position).project(this.camera);
      element.style.transform = `translate3d(${((point.x + 1) / 2) * width}px, ${((1 - point.y) / 2) * height}px, 0) translate(-50%, -50%)`;
    }
  }

  private resize = () => {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.clearLift();
    this.renderer.setSize(width, height);
    this.perspective.aspect = width / height;
    this.perspective.updateProjectionMatrix();
    const aspect = width / height;
    const half = Math.max(APARTMENT.depth / 2 + 0.7, (APARTMENT.width / 2 + 0.7) / aspect);
    Object.assign(this.ortho, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
    this.ortho.updateProjectionMatrix();
    this.invalidate();
  };

  private pointerNdc(event: PointerEvent): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  }

  private floorHit(event: PointerEvent): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.pointerNdc(event), this.camera);
    return this.raycaster.ray.intersectPlane(this.floorPlane, new THREE.Vector3());
  }

  private pickItem(event: PointerEvent): string | null {
    this.raycaster.setFromCamera(this.pointerNdc(event), this.camera);
    const proxies = [...this.live.values()].map((live) => live.proxy);
    const hits = this.raycaster.intersectObjects(proxies, false);
    // A rug lies under everything, so anything else at the same spot wins.
    const roleOf = (uid: string) => CATALOG_BY_ID.get(this.items.find((item) => item.uid === uid)?.catalogId ?? "")?.role;
    const solid = hits.find((hit) => roleOf(hit.object.userData.uid) !== "rug");
    return (solid ?? hits[0])?.object.userData.uid ?? null;
  }

  private onContextLost = (event: Event) => {
    event.preventDefault();
    if (!this.disposed) this.events.onContextLost();
  };

  private onPointerDown = (event: PointerEvent) => {
    // A second finger means pinch or pan, never a move.
    if (!event.isPrimary) {
      if (this.press?.offset && this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId);
      this.press = null;
      this.controls.enabled = true;
      return;
    }
    const uid = this.pickItem(event);
    let offset: THREE.Vector3 | null = null;
    // On touch a piece must be selected before it moves, so a finger can orbit a full room.
    const movable = uid && (event.pointerType !== "touch" || uid === this.selected);
    if (movable) {
      const hit = this.floorHit(event);
      const item = this.items.find((entry) => entry.uid === uid)!;
      if (hit) offset = new THREE.Vector3(item.x, 0, item.z).sub(hit);
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(event.pointerId);
    }
    this.press = { x: event.clientX, y: event.clientY, uid, offset, dragging: false };
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.press?.uid || !this.press.offset) return;
    if (!this.press.dragging && Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) < (event.pointerType === "touch" ? TAP_SLOP_PX : 4)) return;
    if (!this.press.dragging) navigator.vibrate?.(8);
    this.press.dragging = true;
    const hit = this.floorHit(event);
    if (!hit) return;
    const next = hit.add(this.press.offset);
    const index = this.items.findIndex((entry) => entry.uid === this.press!.uid);
    const item = this.items[index];
    // Furniture stays on a measured floor: the room under the pointer, or the one it is already in.
    const room = roomAt(next.x, next.z) ?? roomAt(item.x, item.z) ?? this.room;
    const placed = clampToRoom({ ...item, x: next.x, z: next.z }, room);
    this.items = this.items.map((entry, position) => (position === index ? { ...entry, ...placed } : entry));
    this.syncTransforms();
    if (this.selected !== item.uid) this.select(item.uid);
    this.refreshOutline();
    this.invalidate();
    this.events.onItemsChange(this.items, false);
  };

  private onPointerUp = (event: PointerEvent) => {
    const press = this.press;
    this.press = null;
    this.controls.enabled = true;
    if (!press) return;
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId);
    if (press.dragging) {
      this.renderer.shadowMap.needsUpdate = true;
      this.invalidate();
      this.events.onItemsChange(this.items, true);
      return;
    }
    const slop = event.pointerType === "touch" ? TAP_SLOP_PX : 4;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= slop) return;
    this.select(press.uid);
  };
}
