import { useEffect, useState } from "react";
import { api, type Auth } from "../../api/client";
import type { SessionView, Vec2 } from "../../api/contracts";

export function PhotoDraft({ auth, session, width, setWidth, onSession, onApply }: {
  auth: Auth; session: SessionView; width: string; setWidth: (value: string) => void;
  onSession: (session: SessionView) => void; onApply: (width: number, depth: number, id: string) => void;
}) {
  const [photoId, setPhotoId] = useState(session.photos[0]?.id ?? "");
  const [src, setSrc] = useState<string>();
  const [marks, setMarks] = useState<Vec2[]>([]);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const job = session.reconstruction;
  const running = job?.status === "running";
  useEffect(() => {
    setSrc(undefined); setMarks([]);
    let alive = true, url: string | undefined;
    api.blobUrl(auth, `photos/${photoId}`).then((value) => {
      url = value; if (alive) setSrc(value); else URL.revokeObjectURL(value);
    }).catch(() => setError("Could not load the reference photo."));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [auth.id, auth.token, photoId]);
  useEffect(() => {
    if (!running) return;
    let alive = true;
    const timer = setTimeout(() => {
      api.getSession(auth).then((next) => { if (alive) onSession(next); }).catch(() => {
        if (alive) setError("Connection interrupted. Reload to recover the saved job status.");
      });
    }, 2000);
    return () => { alive = false; clearTimeout(timer); };
  }, [auth.id, auth.token, running, job, onSession]);
  const start = async () => {
    setSubmitting(true); setError(undefined);
    try {
      onSession(await api.reconstruct(auth, { photo_id: photoId, corner: marks[0], wall_a: marks[1], wall_b: marks[2], reference_width_m: Number(width) }));
    } catch (cause) { setError((cause as Error).message); }
    finally { setSubmitting(false); }
  };
  return <details className="photo-draft" open={running || job?.status === "ready" || undefined}>
    <summary>Try a photo-derived corner (experimental)</summary>
    <p className="plan-note">Choose a photo showing both wall-floor edges. Tap 1: the corner, 2: the far end of wall A, 3: the far end of wall B. All three points must be on the floor. Use a right-angle corner.</p>
    <label className="plan-field">Reference photo<select className="rs-input" disabled={running} value={photoId} onChange={(e) => setPhotoId(e.target.value)}>
      {session.photos.map((photo, index) => <option value={photo.id} key={photo.id}>Photo {index + 1}</option>)}
    </select></label>
    {src && <div className="anchor-photo" onClick={(event) => {
      if (running || marks.length >= 3) return;
      const rect = event.currentTarget.getBoundingClientRect();
      setMarks([...marks, [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height]]);
    }}>
      <img src={src} alt="Tap the floor corner and the two wall endpoints" draggable={false} />
      {marks.map(([x, y], index) => <span className="anchor-marker" key={index} style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>{index + 1}</span>)}
    </div>}
    <button type="button" className="link-button" disabled={running} onClick={() => setMarks([])}>Clear markers</button>
    <label className="plan-field">Measured distance from marker 1 to marker 2 (meters)
      <input className="rs-input" type="number" inputMode="decimal" min="1" max="15" step="0.01" value={width} onChange={(e) => setWidth(e.target.value)} disabled={running} />
    </label>
    <p className="plan-note">The first run may take several minutes to load the model. Photo jobs have a separate daily limit; a failed attempt also counts.</p>
    <button type="button" className="rs-button" disabled={running || submitting || marks.length !== 3 || Number(width) < 1 || Number(width) > 15} onClick={() => void start()}>{running ? "Building photo draft…" : "Build photo draft"}</button>
    {job?.error && <p className="error-note" role="alert">{job.error}</p>}
    {error && <p className="error-note" role="alert">{error}</p>}
    {job?.status === "ready" && job.result && <div className="notice">
      <p>Proposed corner: {job.result.width_m.toFixed(2)} × {job.result.depth_m.toFixed(2)} m. The first length is your scale reference; the second is photo-derived.</p>
      <p>Measure wall B independently before relying on a tight fit. Correct the draft below if needed.</p>
      <button type="button" className="rs-button" onClick={() => onApply(job.result!.width_m, job.result!.depth_m, job.id)}>Use and review this draft</button>
    </div>}
  </details>;
}
