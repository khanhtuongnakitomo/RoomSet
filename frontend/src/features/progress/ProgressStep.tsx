// Polls the build job. A failure keeps the inputs and offers an explicit retry.

import { useEffect, useState } from "react";
import { ApiError, api, type Auth } from "../../api/client";
import type { SessionView } from "../../api/contracts";

const POLL_MS = 1500;

const STATUS_COPY: Record<string, string> = {
  reconstructing: "Preparing your confirmed room…",
  building: "Building your room and sofa…",
};

interface Props {
  auth: Auth;
  session: SessionView;
  onSession: (session: SessionView) => void;
  onDone: (session: SessionView) => void;
}

export function ProgressStep({ auth, session, onSession, onDone }: Props) {
  const [error, setError] = useState<string | null>(null);
  const busy = session.status === "reconstructing" || session.status === "building";

  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => {
      api.getSession(auth).then(onSession).catch((cause: ApiError) => setError(cause.message));
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [auth, busy, onSession, session]);

  if (busy) {
    return (
      <section className="plan-full" role="status">
        <img src="/landing/hero-kitchen.webp" alt="" />
        <h2>{STATUS_COPY[session.status]}</h2>
        <div className="progress-bar"><span /></div>
        {error && <p className="error-note">{error}</p>}
      </section>
    );
  }

  return (
    <section className="plan-full">
      <img src="/landing/hero-kitchen.webp" alt="" />
      <h2>That didn't finish</h2>
      <p className="error-note" role="alert">{session.error?.message ?? "We could not finish this model."}</p>
      {error && <p className="error-note">{error}</p>}
      <button className="rs-button" onClick={() => {
        setError(null);
        api.startBuild(auth).then(onDone).catch((cause: ApiError) => setError(cause.message));
      }}>Try again</button>
    </section>
  );
}
