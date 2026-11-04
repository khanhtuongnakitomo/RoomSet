// The pages: landing at /, the start page at /start, the sample apartment at /studio and the planner at /app, joined by one curtain transition.

import { MotionConfig, motion, useAnimationControls } from "motion/react";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Hub } from "../features/hub/Hub";
import { Landing } from "../landing/Landing";
import { EASE_INOUT } from "../landing/motion";
import { onNavigate, trackTransition } from "./nav";

const AppPage = lazy(() => import("./App").then((module) => ({ default: module.App })));
const FitDemoPage = lazy(() => import("../features/hub/FitDemo").then((module) => ({ default: module.FitDemo })));
const DemoPage = lazy(() => import("../features/hub/Demo").then((module) => ({ default: module.Demo })));

const ArPage = lazy(() => import("../features/ar/ArGallery").then((module) => ({ default: module.ArGallery })));

const StudioPage = lazy(() => import("../studio/Studio").then((module) => ({ default: module.Studio })));

const COVER = "inset(100% 0% 0% 0%)";
const FULL = "inset(0% 0% 0% 0%)";
const GONE = "inset(0% 0% 100% 0%)";
const DURATION_S = 0.7;
const TOUCH_DURATION_S = 0.4;
const THEME: [string, string][] = [["/app", "#F7F4ED"], ["/studio", "#1d2e26"], ["/ar", "#273D32"]];
const THEME_DEFAULT = "#273D32";

export function Root() {
  const [path, setPath] = useState(window.location.pathname);
  const curtain = useAnimationControls();
  const busy = useRef(false);
  const shown = useRef(path);
  // A click during a transition runs right after it, so no click is lost. The latest one wins.
  const queued = useRef<{ next: string; push: boolean } | null>(null);

  const go = useCallback(
    async (next: string, push: boolean) => {
      if (busy.current) {
        queued.current = { next, push };
        return;
      }
      if (/^https?:/.test(next)) {
        window.location.href = next;
        return;
      }
      busy.current = true;
      let finished = () => {};
      trackTransition(new Promise((resolve) => { finished = resolve; }));
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = window.matchMedia("(pointer: coarse)").matches ? TOUCH_DURATION_S : DURATION_S;
      if (!reduced) {
        curtain.set({ clipPath: COVER });
        await curtain.start({ clipPath: FULL, transition: { duration, ease: EASE_INOUT } });
      }
      if (push) window.history.pushState({}, "", next);
      shown.current = next;
      setPath(next);
      window.scrollTo(0, 0);
      if (!reduced) await curtain.start({ clipPath: GONE, transition: { duration, ease: EASE_INOUT, delay: 0.08 } });
      busy.current = false;
      finished();
      const waiting = queued.current;
      queued.current = null;
      if (waiting && waiting.next !== shown.current) void go(waiting.next, waiting.push);
    },
    [curtain],
  );

  useEffect(() => {
    const color = THEME.find(([prefix]) => path.startsWith(prefix))?.[1] ?? THEME_DEFAULT;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  }, [path]);

  useEffect(() => onNavigate((next) => void go(next, true)), [go]);
  useEffect(() => {
    const onPop = () => void go(window.location.pathname, false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [go]);

  return (
    <MotionConfig reducedMotion="user">
      {path.startsWith("/demo/sample") ? (
        <Suspense fallback={<div className="page-hold" />}><FitDemoPage /></Suspense>
      ) : path.startsWith("/demo") ? (
        <Suspense fallback={null}><DemoPage /></Suspense>
      ) : path.startsWith("/app") ? (
        <Suspense fallback={null}>
          <AppPage />
        </Suspense>
      ) : path.startsWith("/start") ? (
        <Hub />
      ) : path.startsWith("/ar") ? (
        <Suspense fallback={<div className="page-hold" />}>
          <ArPage />
        </Suspense>
      ) : path.startsWith("/studio") ? (
        <Suspense fallback={<div className="page-hold" />}>
          <StudioPage />
        </Suspense>
      ) : (
        <Landing />
      )}
      <motion.div className="page-curtain" aria-hidden="true" initial={{ clipPath: COVER }} animate={curtain}>
        <img src="/brand/logo-light.png" alt="" />
      </motion.div>
    </MotionConfig>
  );
}
