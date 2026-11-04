// Chooses the screen from server state, so a reload always lands in the right place.

import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, type Auth } from "../api/client";
import type { Capabilities, SessionView } from "../api/contracts";
import { CaptureStep } from "../features/capture/CaptureStep";
import { ClarifyStep } from "../features/clarify/ClarifyStep";
import { PlannerNav } from "../features/planner/PlannerNav";
import { StepLayout } from "../features/planner/StepLayout";
import { ProductStep } from "../features/product/ProductStep";
import { ProgressStep } from "../features/progress/ProgressStep";
import { ResultStep } from "../features/result/ResultStep";
import { navigate } from "./nav";
import { loadAuth, saveAuth } from "./sessionStore";

type Override = "product" | "capture" | "clarify" | null;

export function App() {
  const [auth, setAuth] = useState<Auth | null>(loadAuth);
  const [session, setSession] = useState<SessionView | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [override, setOverride] = useState<Override>(null);
  const [restoring, setRestoring] = useState(Boolean(auth));
  const [error, setError] = useState<string | null>(null);
  const [serverMissing, setServerMissing] = useState(false);

  useEffect(() => {
    api.capabilities().then(setCapabilities).catch(() => setServerMissing(true));
  }, []);

  useEffect(() => {
    if (!auth || session) return;
    api.getSession(auth)
      .then(setSession)
      .catch((cause: ApiError) => {
        if (cause.status === 404) {
          saveAuth(null);
          setAuth(null);
        } else setError(cause.message);
      })
      .finally(() => setRestoring(false));
  }, [auth, session]);

  const begin = useCallback(async () => {
    setError(null);
    try {
      const created = await api.createSession();
      const next = { id: created.session.id, token: created.token };
      saveAuth(next);
      setAuth(next);
      setSession(created.session);
    } catch (cause) {
      setError((cause as ApiError).message);
    }
  }, []);

  // Arriving here means starting a plan; the choice was made on the /start page.
  const starting = useRef(false);
  useEffect(() => {
    if (auth || !capabilities || starting.current) return;
    starting.current = true;
    void begin();
  }, [auth, capabilities, begin]);

  const startOver = useCallback(async () => {
    if (auth) await api.deleteSession(auth).catch(() => undefined);
    saveAuth(null);
    navigate("/start");
  }, [auth]);

  const update = useCallback((next: SessionView) => {
    setSession(next);
    setOverride(null);
  }, []);

  const content = () => {
    if (serverMissing) {
      return (
        <StepLayout image="/landing/hero-kitchen.webp" title="Your own room needs the full app." lead="This preview runs without a server.">
          <div className="plan-group">
            <p className="plan-note">You can still try the fit demo, walk through the 3D apartment, and place furniture in your real room with AR.</p>
            <div className="plan-actions">
              <button className="rs-button" onClick={() => navigate("/demo")}>Try the fit demo<ArrowRight size={20} strokeWidth={1.5} /></button>
              <button className="rs-button rs-button--secondary" onClick={() => navigate("/studio")}>Sample apartment</button>
            </div>
          </div>
        </StepLayout>
      );
    }
    if (!auth && error) return <div className="plan-center"><button className="rs-button" onClick={() => void begin()}>Try again</button></div>;
    if (restoring || !capabilities || !auth || !session) return <div className="plan-center" role="status">Loading…</div>;
    if (override === "product" || !session.product?.confirmed) {
      return <ProductStep auth={auth} session={session} capabilities={capabilities} onDone={update} />;
    }
    if (override === "clarify") return <ClarifyStep auth={auth} session={session} onDone={update} onBack={() => setOverride(null)} reconstructionEnabled={capabilities.reconstruction === "photo_assisted"} />;
    switch (session.status) {
      case "ready":
        return <ResultStep key={session.scene?.assets.furniture} auth={auth} session={session} capabilities={capabilities} onSession={setSession} onStartOver={startOver} onEditProduct={() => setOverride("product")} onEditRoom={() => setOverride("clarify")} />;
      case "reconstructing":
      case "building":
      case "failed":
        return <ProgressStep auth={auth} session={session} onSession={setSession} onDone={update} />;
      case "needs_input":
        if (override !== "capture") {
          return <ClarifyStep auth={auth} session={session} onDone={update} onBack={() => setOverride("capture")} reconstructionEnabled={capabilities.reconstruction === "photo_assisted"} />;
        }
    }
    return (
      <CaptureStep
        auth={auth}
        session={session}
        capabilities={capabilities}
        onSession={setSession}
        onDone={update}
        onBack={() => setOverride("product")}
      />
    );
  };

  const step = () => {
    if (serverMissing || !session) return null;
    if (override === "product" || !session.product?.confirmed) return 0;
    if (override === "clarify") return 2;
    if (session.status === "needs_input") return override === "capture" ? 1 : 2;
    return ["ready", "reconstructing", "building", "failed"].includes(session.status) ? 3 : 1;
  };

  return (
    <div className="app">
      <PlannerNav step={step()} onStartOver={auth ? startOver : undefined} />
      <main className="app-main">
        {content()}
        {error && <p className="error-note app-toast" role="alert">{error}</p>}
      </main>
    </div>
  );
}
