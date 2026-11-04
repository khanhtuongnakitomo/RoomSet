import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { navigate } from "../../app/nav";
import { saveAuth } from "../../app/sessionStore";
import { StepLayout } from "../planner/StepLayout";
import { REPO_URL } from "./links";

export function Demo() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // Without a server (a static preview) the demo runs from prebuilt files in the browser.
  const [hasServer, setHasServer] = useState(true);
  useEffect(() => {
    api.capabilities().catch(() => setHasServer(false));
  }, []);
  const start = async (sample: boolean) => {
    if (sample && !hasServer) {
      navigate("/demo/sample");
      return;
    }
    setBusy(true); setError(undefined);
    try {
      const result = await (sample ? api.createSample() : api.createSession());
      saveAuth({ id: result.session.id, token: result.token });
      navigate("/app");
    } catch (cause) { setError((cause as Error).message); setBusy(false); }
  };
  return <div className="app"><main className="app-main">
    <StepLayout image="/landing/hero-lounge.webp" title="Will it fit?" lead="See the decision in a minute, then try your own room.">
      <ol className="demo-steps">
        <li>A 250 cm sofa in a sample corner with a 240 cm wall.</li>
        <li>Try the 210 cm variant and see the available length change.</li>
        <li>Move it into the marked door clearance, rotate it, then save a better layout.</li>
      </ol>
      <p className="plan-note">The quick demo uses prepared room dimensions. It is not reconstructed from your photos.</p>
      <div className="plan-actions plan-actions--stack">
        <button className="rs-button" disabled={busy} onClick={() => void start(true)}>{busy ? "Opening…" : "Open the 60-second demo"}</button>
        {hasServer
          ? <button className="link-button" disabled={busy} onClick={() => void start(false)}>Start with my own sofa and room</button>
          : <a className="link-button" href={REPO_URL} target="_blank" rel="noreferrer noopener">Your own room needs the full app: how to run it</a>}
      </div>
      {error && <p className="error-note" role="alert">{error}</p>}
    </StepLayout>
  </main></div>;
}
