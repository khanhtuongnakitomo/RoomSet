// The doorway after "Try": two full-height rooms to walk into. Every part of the product starts here.

import { ArrowUpRight, Box, Compass, Move, Ruler, ScanEye, ScanLine, Sofa, type LucideIcon } from "lucide-react";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { api } from "../../api/client";
import { navigate } from "../../app/nav";
import { loadAuth } from "../../app/sessionStore";
import "./hub.css";

const WARM_AFTER_MS = 1200;

function go(path: string) {
  return (event: MouseEvent) => {
    event.preventDefault();
    navigate(path);
  };
}

function Door({ href, image, alt, index, kicker, title, body, points, action }: {
  href: string;
  image: string;
  alt: string;
  index: string;
  kicker: string;
  title: ReactNode;
  body: string;
  points: [LucideIcon, string][];
  action: string;
}) {
  return (
    <a className="hub-door" href={href} onClick={go(href)}>
      <img src={image} alt={alt} decoding="async" />
      <span className="hub-shade" aria-hidden="true" />
      <span className="hub-index" aria-hidden="true">{index}</span>
      <span className="hub-copy">
        <span className="hub-kicker">{kicker}</span>
        <span className="hub-title">{title}</span>
        <span className="hub-body">{body}</span>
        <span className="hub-points">
          {points.map(([Icon, label]) => <span key={label}><Icon size={18} strokeWidth={1.4} />{label}</span>)}
        </span>
        <span className="hub-action">{action}<ArrowUpRight size={20} strokeWidth={1.4} /></span>
      </span>
    </a>
  );
}

// Fetches the studio ahead of the click, so the door opens without a wait.
function warmStudio() {
  void import("../../studio/Studio");
  void import("../../studio/engine");
  void import("../../studio/apartment").then(({ ROOMS }) => {
    for (const room of ROOMS) void fetch(`/studio/rooms/${room.pano}.jpg`).catch(() => undefined);
  });
  void fetch("/studio/rooms/environment.hdr").catch(() => undefined);
}

export function Hub() {
  const hasPlan = Boolean(loadAuth());
  // A static preview has no server, so the second door opens the fit demo instead of the planner.
  const [hasServer, setHasServer] = useState(true);
  useEffect(() => {
    api.capabilities().catch(() => setHasServer(false));
  }, []);
  useEffect(() => {
    const timer = setTimeout(warmStudio, WARM_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="hub">
      <h1 className="hub-title-hidden">Where would you like to begin?</h1>
      <header className="hub-top">
        <a href="/" onClick={go("/")} aria-label="Roomset home"><img src="/brand/logo-light.png" alt="roomset" /></a>
        <a className="hub-ar" href="/ar" onClick={go("/ar")}>
          <ScanEye size={18} strokeWidth={1.5} aria-hidden="true" />In your room<span>AR</span>
        </a>
      </header>
      <span className="hub-line" aria-hidden="true" />
      <main className="hub-doors">
        <Door
          href="/studio"
          image="/landing/hub-plan.webp"
          alt="A 3D model of a furnished three-room apartment, seen from above"
          index="01"
          kicker="Sample apartment"
          title={<>Walk through a<br /><em>furnished</em> home</>}
          body="Real rooms in true 3D, ready now."
          points={[[Box, "Orbit in 3D"], [Move, "Move anything"], [Compass, "Architect's review"]]}
          action="Enter the apartment"
        />
        <Door
          href={hasServer ? "/app" : "/demo"}
          image="/landing/hero-lounge.webp"
          alt="A bright lounge with armchairs, a sofa and a chandelier"
          index="02"
          kicker="Your room"
          title={<>Plan <em>your</em><br /><em>own</em> space</>}
          body={!hasServer ? "Will it fit? See it in 60 seconds." : hasPlan ? "Your plan is saved on this device." : "Your furniture, your room, your layout."}
          points={[[Sofa, "Confirm the piece"], [ScanLine, "Show the room"], [Ruler, "Check the fit"]]}
          action={!hasServer ? "Try the fit demo" : hasPlan ? "Continue your plan" : "Start a plan"}
        />
      </main>
    </div>
  );
}
