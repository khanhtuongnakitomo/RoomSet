// Three.js scene for the editor. Framework-free. Dragging stays local: no network, no rebuild.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import type { Placement, SceneV1 } from "../api/contracts";
import { keepInsideWalls } from "./geometry";

export type ViewMode = "orbit" | "top";

export interface EngineEvents {
  onPlacement: (placement: Placement, final: boolean) => void;
}

/**
 * A real room panorama. The camera stays exactly where the panorama was shot, so the photo is never
 * distorted: people look around the room and move the sofa on its floor.
 */
export interface Backdrop {
  panorama: string;
  /** Height the panorama was shot from, in meters. */
  captureHeight: number;
  rotation: number;
  sunDirection: [number, number, number];
  /** Where the sofa may go, so it stays on the photographed floor: minX, maxX, minZ, maxZ. */
  bounds: [number, number, number, number];
}

export interface LoadOptions {
  headers?: Record<string, string>;
  environment?: string;
  floorTexture?: string;
  backdrop?: Backdrop;
}

const SIZE_TOLERANCE_M = 0.01;
const BLOCKED_TINT = 0x9d3e35;
const CANVAS_COLOR = 0xf7f4ed;
const FLOOR_TILE_M = 2.4;

function contactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d")!;
  context.filter = "blur(14px)";
  context.fillStyle = "rgba(20, 16, 12, 0.85)";
  context.fillRect(30, 30, 196, 196);
  return new THREE.CanvasTexture(canvas);
}

export class EditorEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private perspective = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 100);
  private camera: THREE.Camera = this.perspective;
  private controls!: OrbitControls;
  private sofa = new THREE.Group();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private raycaster = new THREE.Raycaster();
  private dragOffset: THREE.Vector3 | null = null;
  private blocked = false;
  private center = new THREE.Vector3();
  private span = 5;
  private frame = 0;
  private observer: ResizeObserver;
  private sun = new THREE.DirectionalLight(0xfff4e6, 1.6);
  private disposed = false;
  private backdrop: Backdrop | null = null;
  private room: SceneV1 | null = null;

  constructor(private container: HTMLElement, private events: EngineEvents) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.matchMedia("(pointer: coarse)").matches ? 1.6 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(CANVAS_COLOR);

    this.sun.position.set(3.5, 6, 3);
    this.sun.castShadow = true;
    const shadowSize = window.matchMedia("(pointer: coarse)").matches ? 1024 : 2048;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.radius = 9;
    this.sun.shadow.blurSamples = 16;
    this.sun.shadow.bias = -0.0004;
    Object.assign(this.sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 24 });
    this.scene.add(this.sun);
    this.scene.add(this.sofa);

    // Registered before OrbitControls, so a drag can disable orbiting for the same press.
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);

    this.controls = new OrbitControls(this.perspective, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.06;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 14;
    this.controls.addEventListener("change", this.invalidate);

    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    this.resize();
  }

  /** Loads the room and sofa. Returns a warning if the asset size breaks the contract. */
  async load(
    scene: SceneV1,
    assets: { room?: string; furniture: string },
    placement: Placement,
    options: LoadOptions = {},
  ): Promise<string | null> {
    const loader = new GLTFLoader();
    if (options.headers) loader.setRequestHeader(options.headers);
    const [room, furniture] = await Promise.all([
      assets.room ? loader.loadAsync(assets.room) : Promise.resolve(null),
      loader.loadAsync(assets.furniture),
    ]);
    if (this.disposed) return null;

    if (options.environment) await this.loadEnvironment(options.environment, options.backdrop?.rotation ?? 0);
    if (this.disposed) return null;
    if (options.backdrop) await this.loadBackdrop(options.backdrop);
    if (this.disposed) return null;

    if (room) {
      room.scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh) mesh.receiveShadow = true;
      });
      this.scene.add(room.scene);
      if (options.floorTexture) await this.applyFloorTexture(room.scene, options.floorTexture);
    }

    furniture.scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    this.sofa.add(furniture.scene);
    this.addContactShadow(scene);
    this.setBlocked(this.blocked);

    const [width, height, depth] = scene.furniture.dimensions;
    const actual = new THREE.Box3().setFromObject(furniture.scene).getSize(new THREE.Vector3());
    const mismatch = Math.max(Math.abs(actual.x - width), Math.abs(actual.y - height), Math.abs(actual.z - depth));

    const xs = scene.floor.map((p) => p[0]);
    const zs = scene.floor.map((p) => p[1]);
    this.span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    this.center.set((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2);
    this.room = scene;
    this.setPlacement(placement);
    this.setView("orbit");
    return mismatch > SIZE_TOLERANCE_M ? "The 3D model's size doesn't match the confirmed dimensions." : null;
  }

  setPlacement({ position, yaw }: Placement): void {
    this.sofa.position.set(position[0], 0, position[1]);
    this.sofa.rotation.y = yaw;
    this.invalidate();
  }

  getPlacement(): Placement {
    const round = (value: number) => Math.round(value * 1000) / 1000;
    return { position: [round(this.sofa.position.x), round(this.sofa.position.z)], yaw: round(this.sofa.rotation.y) };
  }

  /** Safe to call before the model loads; load() applies the latest value. */
  setBlocked(blocked: boolean): void {
    this.blocked = blocked;
    this.sofa.traverse((node) => {
      const material = (node as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!material?.emissive) return;
      material.emissive.setHex(BLOCKED_TINT);
      material.emissiveIntensity = blocked ? 0.55 : 0;
    });
    this.invalidate();
  }

  setView(mode: ViewMode): void {
    if (this.backdrop) {
      this.lookAtSofa();
      return;
    }
    const target = this.sofa.position;
    if (mode === "top") {
      this.camera = this.ortho;
      this.ortho.position.set(this.center.x, 20, this.center.z);
      this.ortho.up.set(0, 0, -1);
      this.ortho.lookAt(this.center.x, 0, this.center.z);
      this.controls.object = this.ortho;
      this.controls.enableRotate = false;
      this.controls.target.set(this.center.x, 0, this.center.z);
    } else {
      this.camera = this.perspective;
      // Portrait screens see less sideways, so pull back to keep the whole sofa comfortably in frame.
      const aspect = this.container.clientWidth / Math.max(this.container.clientHeight, 1);
      const distance = 4.6 * Math.max(1, 1.25 / aspect);
      // Standing eye height with a level gaze keeps verticals upright, like a room photograph.
      this.perspective.position.set(target.x + distance * 0.34, 1.3, target.z + distance * 0.94);
      this.controls.object = this.perspective;
      this.controls.enableRotate = true;
      this.controls.target.set(target.x, 0.42, target.z);
    }
    this.resize();
    this.controls.update();
    this.invalidate();
  }

  /** A JPEG of the current view, rendered on demand for style previews. */
  snapshot(): Promise<Blob> {
    this.renderer.render(this.scene, this.camera);
    return new Promise((resolve, reject) => {
      this.renderer.domElement.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not capture the view"))),
        "image/jpeg",
        0.9,
      );
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("wheel", this.onWheel);
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      mesh.geometry?.dispose();
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m?.dispose());
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }

  private async loadEnvironment(url: string, rotation: number): Promise<void> {
    const texture = await new RGBELoader().loadAsync(url);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromEquirectangular(texture).texture;
    this.scene.environmentRotation.y = rotation;
    this.scene.environmentIntensity = 0.85;
    texture.dispose();
    pmrem.dispose();
  }

  private async loadBackdrop(backdrop: Backdrop): Promise<void> {
    const texture = await new THREE.TextureLoader().loadAsync(backdrop.panorama);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.scene.background = texture;
    this.scene.backgroundRotation.y = backdrop.rotation;
    this.backdrop = backdrop;

    // The floor is part of the photo, so only the sofa's shadow is drawn on it.
    const catcher = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
      new THREE.ShadowMaterial({ opacity: 0.32, color: 0x1a120c }),
    );
    catcher.position.y = 0.002;
    catcher.receiveShadow = true;
    this.scene.add(catcher);

    const [x, y, z] = backdrop.sunDirection;
    this.sun.position.set(x, y, z);
    this.sun.intensity = 1.1;
    this.scene.environmentIntensity = 1.15;

    // Looking around in place: the orbit target sits just in front of the camera.
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = -0.35;
    this.controls.minPolarAngle = 0.5;
    this.controls.maxPolarAngle = Math.PI - 0.5;
    this.renderer.domElement.addEventListener("wheel", this.onWheel, { passive: false });
  }

  /** Points the camera at the sofa from the panorama's capture point. */
  lookAtSofa(): void {
    if (!this.backdrop) return;
    const eye = new THREE.Vector3(0, this.backdrop.captureHeight, 0);
    const toSofa = this.sofa.position.clone().setY(0.45).sub(eye).normalize();
    this.perspective.fov = 38;
    this.perspective.updateProjectionMatrix();
    this.perspective.position.copy(eye);
    this.controls.target.copy(eye).addScaledVector(toSofa, 0.01);
    this.controls.update();
    this.invalidate();
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.perspective.fov = THREE.MathUtils.clamp(this.perspective.fov + event.deltaY * 0.02, 22, 62);
    this.perspective.updateProjectionMatrix();
    this.invalidate();
  };

  private async applyFloorTexture(room: THREE.Object3D, url: string): Promise<void> {
    const floor = room.getObjectByName("floor") as THREE.Mesh | undefined;
    if (!floor) return;
    const texture = await new THREE.TextureLoader().loadAsync(url);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const position = floor.geometry.attributes.position;
    const uv = new Float32Array(position.count * 2);
    for (let index = 0; index < position.count; index += 1) {
      uv[index * 2] = position.getX(index) / FLOOR_TILE_M;
      uv[index * 2 + 1] = position.getZ(index) / FLOOR_TILE_M;
    }
    floor.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    // The room GLB carries no normals; this replaced material must not depend on them or it renders black.
    floor.material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.62, flatShading: true });
    this.invalidate();
  }

  private addContactShadow(scene: SceneV1): void {
    const [width, , depth] = scene.furniture.dimensions;
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 1.16, depth * 1.2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }),
    );
    shadow.position.y = 0.004;
    shadow.raycast = () => undefined;
    this.sofa.add(shadow);
  }

  private invalidate = () => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const moving = this.controls.update();
      this.renderer.render(this.scene, this.camera);
      if (moving) this.invalidate();
    });
  };

  private resize = () => {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.perspective.aspect = width / height;
    this.perspective.updateProjectionMatrix();
    const half = this.span * 0.65;
    const aspect = width / height;
    Object.assign(this.ortho, {
      left: -half * Math.max(aspect, 1),
      right: half * Math.max(aspect, 1),
      top: half / Math.min(aspect, 1),
      bottom: -half / Math.min(aspect, 1),
    });
    this.ortho.updateProjectionMatrix();
    this.invalidate();
  };

  private pointer(event: PointerEvent): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  private floorHit(event: PointerEvent): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.pointer(event), this.camera);
    return this.raycaster.ray.intersectPlane(this.floorPlane, new THREE.Vector3());
  }

  private onPointerDown = (event: PointerEvent) => {
    this.raycaster.setFromCamera(this.pointer(event), this.camera);
    if (this.raycaster.intersectObject(this.sofa, true).length === 0) {
      this.controls.enabled = true;
      return;
    }
    const hit = this.floorHit(event);
    if (!hit) return;
    this.dragOffset = this.sofa.position.clone().sub(hit);
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.dragOffset) return;
    const hit = this.floorHit(event);
    if (!hit) return;
    const next = hit.add(this.dragOffset);
    if (this.backdrop) {
      const [minX, maxX, minZ, maxZ] = this.backdrop.bounds;
      next.x = THREE.MathUtils.clamp(next.x, minX, maxX);
      next.z = THREE.MathUtils.clamp(next.z, minZ, maxZ);
    }
    if (this.room) {
      // The sofa slides along a wall it is pushed into rather than passing through it.
      const [x, z] = keepInsideWalls(this.room, { position: [next.x, next.z], yaw: this.sofa.rotation.y }).position;
      next.set(x, 0, z);
    }
    this.sofa.position.set(next.x, 0, next.z);
    this.invalidate();
    this.events.onPlacement(this.getPlacement(), false);
  };

  private onPointerUp = (event: PointerEvent) => {
    if (!this.dragOffset) return;
    this.dragOffset = null;
    this.controls.enabled = true;
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    }
    this.events.onPlacement(this.getPlacement(), true);
  };
}
