// The fit demo with no server: a prebuilt sample room (tools/static_demo/build.py) and the same
// browser-side placement checks as the planner. Nothing here is saved or sent anywhere.

import { ArrowUpRight, Box, CircleAlert, CircleCheck, LayoutGrid, Move, RotateCw, TriangleAlert, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Placement, SceneV1 } from "../../api/contracts";
import { navigate } from "../../app/nav";
import { SceneEditor, type SceneEditorHandle } from "../../editor/SceneEditor";
import { checkPlacement, keepInsideWalls } from "../../editor/geometry";
import { REPO_URL } from "./links";

const BASE = "/samples/fit";
const RAD_TO_DEG = 180 / Math.PI;
const NO_HEADERS = {};
const VARIANTS = [
  { widthCm: 250, file: "sofa-250.glb" },
  { widthCm: 210, file: "sofa-210.glb" },
];

export function FitDemo() {
  const editor = useRef<SceneEditorHandle>(null);
  const [base, setBase] = useState<SceneV1 | null>(null);
  const [failed, setFailed] = useState(false);
  const [variant, setVariant] = useState(VARIANTS[0]);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [view, setView] = useState<"orbit" | "top">("orbit");

  useEffect(() => {
    fetch(`${BASE}/scene.json`)
      .then((response) => {
        if (!response.ok) throw new Error("missing");
        return response.json() as Promise<SceneV1>;
      })
      .then((scene) => {
        setBase(scene);
        setPlacement(scene.furniture.placement);
      })
      .catch(() => setFailed(true));
  }, []);

  const scene = useMemo<SceneV1 | null>(() => {
    if (!base) return null;
    const [, height, depth] = base.furniture.dimensions;
    return {
      ...base,
      furniture: {
        ...base.furniture,
        name: `Demo sofa, ${variant.widthCm} cm`,
        dimensions: [variant.widthCm / 100, height, depth],
      },
    };
  }, [base, variant]);
  const assets = useMemo(() => ({ room: `${BASE}/room.glb`, furniture: `${BASE}/${variant.file}` }), [variant]);

  const check = useMemo(() => (scene && placement ? checkPlacement(scene, placement) : null), [scene, placement]);
  const blocked = Boolean(check && (check.overlaps.length > 0 || check.outsideCaptured));
  useEffect(() => editor.current?.setBlocked(blocked), [blocked]);

  if (failed) {
    return <div className="fit-center"><p>The demo room could not load. Check your connection and reload.</p></div>;
  }
  if (!scene || !placement || !check) return <div className="fit-center" role="status">Loading…</div>;

  const [width, height, depth] = scene.furniture.dimensions;
  const floorWidth = Math.max(...scene.floor.map(([x]) => x));
  const spare = Math.round((floorWidth - width) * 100);

  const move = (next: Placement) => {
    const inside = keepInsideWalls(scene, next);
    editor.current?.setPlacement(inside);
    setPlacement(inside);
  };

  const choose = (next: (typeof VARIANTS)[number]) => {
    if (next.file === variant.file) return;
    // The editor remounts with the new model, so it reloads from this placement.
    setVariant(next);
    setPlacement(keepInsideWalls({ ...scene, furniture: { ...scene.furniture, dimensions: [next.widthCm / 100, height, depth] } }, placement));
    setView("orbit");
  };

  return (
    <div className="app fit">
      <header className="fit-top">
        <a href="/start" aria-label="All options" onClick={(event) => { event.preventDefault(); navigate("/start"); }}><img src="/brand/logo-light.png" alt="roomset" /></a>
        <span>Will it fit?</span>
      </header>
      <section className="result">
        <div className="editor-frame">
          <SceneEditor key={variant.file} ref={editor} scene={scene} assets={assets} headers={NO_HEADERS} placement={placement}
            onPlacement={(next) => setPlacement(next)} onWarning={() => setFailed(true)} />
          <div className="result-labels">
            <span className="rs-badge">Sample room, not from your photos</span>
            <span className="rs-badge">Dimensioned model</span>
          </div>
          <div className="view-switch" role="group" aria-label="View">
            <button className={view === "orbit" ? "is-active" : ""} onClick={() => { setView("orbit"); editor.current?.setView("orbit"); }} aria-label="3D" title="3D"><Box size={20} strokeWidth={1.4} /></button>
            <button className={view === "top" ? "is-active" : ""} onClick={() => { setView("top"); editor.current?.setView("top"); }} aria-label="Top" title="Top"><LayoutGrid size={20} strokeWidth={1.4} /></button>
          </div>
          <p className="editor-hint"><Move size={16} strokeWidth={1.5} />Drag the sofa to move it. Drag anywhere else to look around.</p>
        </div>

        <div className="editor-panel">
          <div className="panel-section">
            <p className={spare < 0 ? "fit-verdict is-over" : "fit-verdict is-ok"}>
              {spare < 0 ? `${Math.abs(spare)} cm too wide` : `${spare} cm to spare`}
            </p>
            <p className="plan-note">{Math.round(width * 100)} cm sofa along the {Math.round(floorWidth * 100)} cm wall, unrotated. Depth {Math.round(depth * 100)} cm, height {Math.round(height * 100)} cm.</p>
            <div className="fit-variants" role="group" aria-label="Sofa width">
              {VARIANTS.map((option) => (
                <button key={option.file} className={option.file === variant.file ? "chip is-active" : "chip"} aria-pressed={option.file === variant.file} onClick={() => choose(option)}>{option.widthCm} cm</button>
              ))}
            </div>
          </div>

          <div className="panel-section">
            <div className="feedback" aria-live="polite">
              {check.overlaps.length > 0 && <p className="plan-status feedback-bad"><CircleAlert size={20} strokeWidth={1.5} />The sofa overlaps {check.overlaps.join(" and ")}. Try moving it.</p>}
              {check.outsideCaptured && <p className="plan-status feedback-warn"><TriangleAlert size={20} strokeWidth={1.5} />Part of the sofa is outside the room.</p>}
              {!blocked && <p className="plan-status feedback-ok"><CircleCheck size={20} strokeWidth={1.5} />No overlap with the walls or the marked door clearance.</p>}
              <p className="plan-note">Try dragging it onto the amber door clearance in the top view.</p>
            </div>
            <div className="plan-field">
              <label className="plan-label" htmlFor="yaw"><RotateCw size={20} strokeWidth={1.5} />Rotate: {Math.round(placement.yaw * RAD_TO_DEG)}°</label>
              <input id="yaw" className="yaw" type="range" min={-180} max={180} step={5} value={Math.round(placement.yaw * RAD_TO_DEG)}
                onChange={(event) => move({ ...placement, yaw: Math.round((Number(event.target.value) / RAD_TO_DEG) * 1000) / 1000 })} />
            </div>
            <div className="plan-actions">
              <button className="plan-round" onClick={() => move(scene.furniture.placement)} aria-label="Reset" title="Reset"><Undo2 size={22} strokeWidth={1.5} /></button>
            </div>
          </div>

          <div className="panel-section">
            <p className="plan-note">The full version takes your own sofa link and room measurements. This preview has no server, so it uses this prepared room.</p>
            <a className="link-button" href={REPO_URL} target="_blank" rel="noreferrer noopener">Run the full app yourself<ArrowUpRight size={16} strokeWidth={1.5} /></a>
            <a className="link-button" href="/ar" onClick={(event) => { event.preventDefault(); navigate("/ar"); }}>Place furniture in your real room (AR)</a>
          </div>
        </div>
      </section>
    </div>
  );
}
