import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { api, type Auth } from "../../api/client";
import type { SofaSpec } from "../../api/contracts";

function disposeModel(model: THREE.Object3D | null) {
  model?.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}

export function ProductPreview({ auth, width, height, depth, geometry }: {
  auth: Auth; width: number; height: number; depth: number; geometry: SofaSpec;
}) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<{ scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; model: THREE.Object3D | null }>();
  const [status, setStatus] = useState("Add the three dimensions to preview your sofa.");
  const signature = JSON.stringify({ name: "Preview", width_m: width, height_m: height, depth_m: depth, geometry });
  useEffect(() => {
    const element = host.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eeeae1");
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    camera.position.set(3, 2, 4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 0.5;
    controls.maxDistance = 12;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x777466, 3));
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(-3, 5, 4);
    scene.add(sun);
    element.appendChild(renderer.domElement);
    stage.current = { scene, camera, controls, model: null };
    const resize = new ResizeObserver(() => {
      const w = element.clientWidth, h = element.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    });
    resize.observe(element);
    renderer.setAnimationLoop(() => renderer.render(scene, camera));
    return () => {
      renderer.setAnimationLoop(null);
      resize.disconnect();
      controls.dispose();
      disposeModel(stage.current?.model ?? null);
      stage.current = undefined;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  useEffect(() => {
    const body = JSON.parse(signature);
    if (!(body.width_m > 0.3 && body.width_m < 6 && body.depth_m > 0.3 && body.depth_m < 4 && body.height_m > 0.2 && body.height_m < 2.5)) {
      setStatus("Add valid width, depth and height to see your sofa.");
      const current = stage.current;
      if (current?.model) { current.scene.remove(current.model); disposeModel(current.model); current.model = null; }
      return;
    }
    const controller = new AbortController();
    let alive = true;
    setStatus("Updating preview…");
    const timer = setTimeout(async () => {
      try {
        const bytes = await api.previewProduct(auth, body, controller.signal);
        const gltf = await new GLTFLoader().parseAsync(bytes, "");
        const current = stage.current;
        if (!alive || !current) { disposeModel(gltf.scene); return; }
        if (current.model) { current.scene.remove(current.model); disposeModel(current.model); }
        current.model = gltf.scene;
        current.scene.add(gltf.scene);
        const distance = Math.max(body.width_m / Math.min(current.camera.aspect, 2), body.depth_m, body.height_m) * 1.8;
        current.controls.target.set(0, body.height_m * 0.45, 0);
        current.camera.position.set(distance * 0.7, distance * 0.6, distance);
        current.controls.update();
        setStatus("Drag to look around. Approximate shape; confirmed outer size.");
      } catch (error) {
        if (alive) setStatus((error as Error).message);
      }
    }, 450);
    return () => { alive = false; controller.abort(); clearTimeout(timer); };
  }, [auth.id, auth.token, signature]);
  return <figure className="product-preview"><div ref={host} className="product-preview-stage" aria-label="Interactive sofa preview" /><figcaption role="status">{status}</figcaption></figure>;
}
