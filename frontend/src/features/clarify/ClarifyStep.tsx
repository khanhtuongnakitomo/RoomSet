// Renders whatever questions the backend asks, then starts the build.

import { ArrowLeft, Box, Camera, Eye, Plus, Ruler, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError, api, type Auth } from "../../api/client";
import type { ObstacleAnswer, RoomAnswers, SessionView } from "../../api/contracts";
import { StepLayout } from "../planner/StepLayout";
import { RoomDiagram, RoomPhoto } from "./RoomDiagram";
import { PhotoDraft } from "./PhotoDraft";

const EMPTY_OBSTACLE = { label: "", width: "", depth: "", height: "1", x: "", z: "", kind: "solid" as "solid" | "keep_clear" };
type ObstacleRow = typeof EMPTY_OBSTACLE;

interface Props {
  auth: Auth;
  session: SessionView;
  onDone: (session: SessionView) => void;
  onBack: () => void;
  reconstructionEnabled?: boolean;
}

export function ClarifyStep({ auth, session, onDone, onBack, reconstructionEnabled }: Props) {
  const saved = session.answers;
  const [values, setValues] = useState<Record<string, string>>({
    room_width_m: saved?.room_width_m?.toString() ?? "",
    room_depth_m: saved?.room_depth_m?.toString() ?? "",
    ceiling_height_m: saved?.ceiling_height_m?.toString() ?? "",
  });
  const [measured, setMeasured] = useState<boolean | null>(saved?.dimensions_measured ?? null);
  const [rows, setRows] = useState<ObstacleRow[]>(
    saved?.obstacles.map((o) => ({ label: o.label, width: String(o.width_m), depth: String(o.depth_m), height: String(o.height_m), x: String(o.x_m), z: String(o.z_m), kind: o.kind ?? "solid" })) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconstructionId, setReconstructionId] = useState(saved?.reconstruction_id ?? null);
  const photoRunning = session.reconstruction?.status === "running";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (measured === null) {
      setError("Tell us whether you measured with a tape.");
      return;
    }
    const obstacles: ObstacleAnswer[] = rows.filter((r) => r.label.trim()).map((r) => ({
      label: r.label.trim(), width_m: Number(r.width), depth_m: Number(r.depth), height_m: Number(r.height), x_m: Number(r.x), z_m: Number(r.z), kind: r.kind,
    }));
    const aiNotes = session.clarifications.filter((c) => c.origin === "ai")
      .map((c) => (values[c.id]?.trim() ? `${c.question} ${values[c.id].trim()}` : ""))
      .filter(Boolean).join(" ").slice(0, 500);
    const answers: RoomAnswers = {
      reconstruction_id: reconstructionId,
      room_width_m: Number(values.room_width_m),
      room_depth_m: Number(values.room_depth_m),
      ceiling_height_m: values.ceiling_height_m ? Number(values.ceiling_height_m) : null,
      dimensions_measured: measured,
      obstacles,
      notes: aiNotes || null,
    };
    setBusy(true);
    setError(null);
    try {
      await api.saveAnswers(auth, answers);
      onDone(await api.startBuild(auth));
    } catch (cause) {
      setError((cause as ApiError).message);
      setBusy(false);
    }
  };

  const setRow = (index: number, patch: Partial<ObstacleRow>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <StepLayout image="/landing/hero-suite.webp" title="A few details about your corner" lead="Your answers set the size of the room.">
      <p className="notice">{reconstructionId ? "Photo-assisted draft: review the dimensions and add obstacles below." : "Measured-room mode: your photos provide context. The walls and objects below are built from the measurements you confirm."}</p>
      {reconstructionEnabled && session.photos.length >= 3 && <PhotoDraft auth={auth} session={session} width={values.room_width_m} setWidth={(value) => setValues({ ...values, room_width_m: value })} onSession={onDone} onApply={(width, depth, id) => {
        setValues({ ...values, room_width_m: String(width), room_depth_m: String(depth) }); setReconstructionId(id); setMeasured(null);
      }} />}
      <div className="room-photo-strip">{session.photos.map((photo, index) => <RoomPhoto key={photo.id} auth={auth} id={photo.id} index={index} />)}</div>
      {reconstructionId && <button className="link-button" disabled={photoRunning} onClick={() => setReconstructionId(null)}>Use measured-room mode instead</button>}
      <RoomDiagram width={Number(values.room_width_m)} depth={Number(values.room_depth_m)}
        sofaWidth={session.product?.width.value_m ?? 0} sofaDepth={session.product?.depth.value_m ?? 0}
        obstacles={rows.filter((r) => r.label && Number(r.width) > 0 && Number(r.depth) > 0).map((r) => ({ label: r.label, width_m: Number(r.width), depth_m: Number(r.depth), height_m: Number(r.height), x_m: Number(r.x), z_m: Number(r.z), kind: r.kind }))} />
      {session.coverage && session.coverage.retake_instructions.length > 0 && (
        <div className="notice" role="status">
          <strong>Some photos could be better.</strong>
          <ul>{session.coverage.retake_instructions.map((text, i) => <li key={i}>{text}</li>)}</ul>
          <button className="link-button" onClick={onBack}><Camera size={18} strokeWidth={1.5} />Replace photos</button>
        </div>
      )}

      <form className="plan-group" onSubmit={submit}>
        <div className="plan-questions">
          {session.clarifications.map((question) => (
            <div key={question.id} className={`question question--${question.answer_type}`}>
              {question.answer_type === "number" && (
                <>
                  <label className="plan-label" htmlFor={question.id}>{question.question}{question.unit ? ` (${question.unit})` : ""}</label>
                  <input id={question.id} className="rs-input" type="number" inputMode="decimal" step="0.01"
                    min={question.id === "ceiling_height_m" ? 1.8 : 1} max={question.id === "ceiling_height_m" ? 8 : 30}
                    required={question.blocking} value={values[question.id] ?? ""}
                    onChange={(e) => setValues({ ...values, [question.id]: e.target.value })} />
                </>
              )}
              {question.answer_type === "text" && (
                <>
                  <label className="plan-label" htmlFor={question.id}>{question.question}</label>
                  <input id={question.id} className="rs-input" maxLength={200} value={values[question.id] ?? ""}
                    onChange={(e) => setValues({ ...values, [question.id]: e.target.value })} />
                </>
              )}
              {question.answer_type === "boolean" && (
                <fieldset className="choice">
                  <legend className="plan-label">{question.question}</legend>
                  <div className="plan-choices">
                    <label className="plan-choice"><Ruler size={22} strokeWidth={1.4} /><input type="radio" name={question.id} checked={measured === true} onChange={() => setMeasured(true)} />Yes, measured</label>
                    <label className="plan-choice"><Eye size={22} strokeWidth={1.4} /><input type="radio" name={question.id} checked={measured === false} onChange={() => setMeasured(false)} />No, it's an estimate</label>
                  </div>
                </fieldset>
              )}
              {question.answer_type === "obstacles" && (
                <fieldset className="choice">
                  <legend className="plan-label">{question.question}</legend>
                  {rows.map((row, index) => (
                    <div key={index} className="obstacle-row">
                      <label className="field">What is it
                        <input className="rs-input" placeholder="Radiator" maxLength={60} value={row.label} onChange={(e) => setRow(index, { label: e.target.value })} />
                      </label>
                      <label className="field">Type<select className="rs-input" value={row.kind} onChange={(e) => setRow(index, { kind: e.target.value as ObstacleRow["kind"] })}><option value="solid">Fixed object</option><option value="keep_clear">Keep-clear area / door swing</option></select></label>
                      {(["width", "depth", "height", "x", "z"] as const).map((field) => (
                        <label key={field} className="field">{OBSTACLE_LABEL[field]}
                          <input className="rs-input" type="number" step="0.01" min={field === "x" || field === "z" ? 0 : 0.03} required={Boolean(row.label.trim())}
                            value={row[field]} onChange={(e) => setRow(index, { [field]: e.target.value })} />
                        </label>
                      ))}
                      <button type="button" className="plan-round" aria-label="Remove" title="Remove" onClick={() => setRows(rows.filter((_, i) => i !== index))}><Trash2 size={20} strokeWidth={1.4} /></button>
                    </div>
                  ))}
                  <p className="plan-note">Position is measured to the CENTER of the object: x from wall B, z from wall A. Keep-clear areas are rectangular approximations.</p>
                  <button type="button" className="plan-add" disabled={rows.length >= 12} onClick={() => setRows([...rows, { ...EMPTY_OBSTACLE }])}><Plus size={18} strokeWidth={1.5} />Add an object or keep-clear area</button>
                </fieldset>
              )}
              {question.help && <p className="plan-note">{question.help}</p>}
            </div>
          ))}
        </div>
        {error && <p className="error-note" role="alert">{error}</p>}
        <div className="plan-actions">
          <button type="button" className="plan-round" onClick={onBack} aria-label="Back" title="Back"><ArrowLeft size={22} strokeWidth={1.5} /></button>
          <button className="rs-button" disabled={busy || photoRunning}>{busy ? "Starting…" : "Build my room"}<Box size={20} strokeWidth={1.5} /></button>
        </div>
      </form>
    </StepLayout>
  );
}

const OBSTACLE_LABEL = { width: "Width m", depth: "Depth m", height: "Height m", x: "Center from wall B m", z: "Center from wall A m" };
