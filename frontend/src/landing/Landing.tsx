// Hero, problem, approach, features, stack, comparison, team.

import Lenis from "lenis";
import { ArrowUpRight, Box, Check, Compass, Eye, Gauge, Layers, LayoutGrid, Minus, Move, Ruler, ShieldCheck, Volume2, VolumeX, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { siBlender, siDocker, siFastapi, siMeta, siPostgresql, siPython, siReact, siRender, siSupabase, siThreedotjs, siTypescript, siVite } from "simple-icons";
import {
  COMPARE_COLUMNS, COMPARE_REFS, COMPARE_ROWS, CREDITS, FEATURES, HERO_SLIDES, ROADMAP, STACK_ROWS, STATS, STAT_SOURCES, STEPS, TEAM,
  type Mark, type Status, type Tech,
} from "./content";
import { APP_PATH, navigate } from "../app/nav";
import { Hero, goToApp } from "./Hero";
import { Intro, shouldPlayIntro } from "./Intro";
import { Reveal } from "./motion";

const FEATURE_ICONS: Record<(typeof FEATURES)[number]["icon"], LucideIcon> = { ruler: Ruler, move: Move, gauge: Gauge, compass: Compass, layers: Layers, shield: ShieldCheck };
const BRAND_PATHS: Record<NonNullable<Tech["icon"]>, string> = {
  react: siReact.path, typescript: siTypescript.path, vite: siVite.path, three: siThreedotjs.path, python: siPython.path, fastapi: siFastapi.path,
  postgres: siPostgresql.path, docker: siDocker.path, blender: siBlender.path, meta: siMeta.path, supabase: siSupabase.path, render: siRender.path,
};

function StatusTag({ status }: { status: Status }) {
  return <span className={`lp-tag lp-tag--${status.toLowerCase()}`}>{status}</span>;
}

function Eyebrow({ children }: { children: string }) {
  return <p className="lp-eyebrow">{children}</p>;
}

function MarkIcon({ mark }: { mark: Mark }) {
  const label = { yes: "Yes", part: "Partly", no: "No", unknown: "Not stated in what we read" }[mark];
  return (
    <span className={`lp-mark lp-mark--${mark}`} role="img" aria-label={label} title={label}>
      {mark === "yes" && <Check size={15} strokeWidth={2} />}
      {mark === "part" && <Minus size={15} strokeWidth={2} />}
      {mark === "no" && <X size={13} strokeWidth={1.6} />}
    </span>
  );
}

function Marquee({ items, reverse, seconds }: { items: Tech[]; reverse?: boolean; seconds: number }) {
  return (
    <div className="lp-mq">
      <div className={reverse ? "lp-mq-track is-reverse" : "lp-mq-track"} style={{ animationDuration: `${seconds}s` }}>
        {[0, 1].map((copy) => (
          <ul key={copy} aria-hidden={copy === 1 || undefined}>
            {items.map((tech) => (
              <li key={tech.name}>
                {tech.icon ? (
                  <svg viewBox="0 0 24 24" width={26} height={26} aria-hidden="true"><path d={BRAND_PATHS[tech.icon]} fill="currentColor" /></svg>
                ) : (
                  <span className="lp-mq-mono" aria-hidden="true">{tech.mono}</span>
                )}
                <span>{tech.name}</span>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

function Approach() {
  const [active, setActive] = useState(0);
  const steps = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    const watcher = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    steps.current.forEach((step) => step && watcher.observe(step));
    return () => watcher.disconnect();
  }, []);
  return (
    <section id="approach" className="lp-section lp-wrap">
      <Reveal>
        <Eyebrow>The approach</Eyebrow>
        <h2 className="lp-title">Real dimensions. A true scale. <em>Your hands</em> on the furniture.</h2>
      </Reveal>
      <div className="lp-approach">
        <div className="lp-approach-media">
          {STEPS.map((step, index) => (
            <img key={step.image} src={step.image} alt={index === active ? step.alt : ""} loading="lazy" decoding="async" className={index === active ? "is-active" : ""} />
          ))}
        </div>
        <ol className="lp-steps">
          {STEPS.map((step, index) => (
            <li key={step.title} ref={(element) => { steps.current[index] = element; }} data-index={index} className={index === active ? "is-active" : ""}>
              <span className="lp-step-number">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// The film starts silently when it scrolls into view and stops when it leaves. One button controls the sound.
function Film() {
  const video = useRef<HTMLVideoElement>(null);
  const mayPlay = useRef(false);
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const node = video.current;
    if (!node) return;
    node.muted = true;
    mayPlay.current = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const watcher = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) node.pause();
      else if (mayPlay.current) void node.play().catch(() => undefined);
    }, { threshold: 0.4 });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);
  const toggleSound = () => {
    const node = video.current;
    if (!node) return;
    node.muted = !node.muted;
    setMuted(node.muted);
    mayPlay.current = true;
    if (node.paused) void node.play().catch(() => undefined);
  };
  const Icon = muted ? VolumeX : Volume2;
  return (
    <section id="film" className="lp-film lp-wrap">
      <Reveal>
        <Eyebrow>The film</Eyebrow>
        <h2 className="lp-title">Three minutes, <em>one</em> question.</h2>
      </Reveal>
      <Reveal className="lp-film-frame">
        <video
          ref={video}
          src="/landing/roomset-film.mp4"
          poster="/landing/roomset-film-poster.webp"
          preload="none"
          muted
          loop
          playsInline
          aria-label="The three-minute Roomset film"
        />
        <button type="button" className="lp-film-sound" onClick={toggleSound} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>
          <Icon size={24} strokeWidth={1.5} />
        </button>
      </Reveal>
      <p className="lp-film-note">2:58. Real product captures with some waits shortened. The AR camera shot is an illustration. AI narration.</p>
    </section>
  );
}

export function Landing() {
  const [intro, setIntro] = useState(shouldPlayIntro);
  const [play, setPlay] = useState(!intro);
  const reveal = useCallback(() => setPlay(true), []);
  const done = useCallback(() => setIntro(false), []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1 });
    let frame = requestAnimationFrame(function loop(time) {
      lenis.raf(time);
      frame = requestAnimationFrame(loop);
    });
    const onAnchor = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!link) return;
      event.preventDefault();
      lenis.scrollTo(link.getAttribute("href")!, { offset: -72, duration: 1.3 });
    };
    document.addEventListener("click", onAnchor);
    return () => {
      document.removeEventListener("click", onAnchor);
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="lp">
      {intro && <Intro image={HERO_SLIDES[0].src} onReveal={reveal} onDone={done} />}
      <Hero play={play} />

      <main>
        <section className="lp-opening lp-wrap">
          <Reveal className="lp-opening-copy">
            <Eyebrow>Plan your space</Eyebrow>
            <h2 className="lp-statement">Make room for what <em>fits.</em></h2>
            <p className="lp-lede">Roomset lets you try real furniture at its true size in a 3D plan of a room, move it until it works, and check the numbers before you buy.</p>
          </Reveal>
          <Reveal as="figure" className="lp-opening-photo"><img src="/landing/photo-loft.webp" alt="An open loft with a sofa, dining table and tall black windows" loading="lazy" decoding="async" /></Reveal>
        </section>

        <Film />

        <section id="problem" className="lp-dark">
          <div className="lp-wrap lp-problem">
            <Reveal className="lp-problem-head">
              <Eyebrow>The problem</Eyebrow>
              <h2 className="lp-title">A listing gives you three numbers. Your room has <em>opinions.</em></h2>
              <p className="lp-lede">A radiator, a door swing, a wall shorter than you remember. Most of the time, you find out whether they agree on delivery day.</p>
            </Reveal>
            <div className="lp-problem-body">
              <div className="lp-collage">
                <Reveal as="figure" className="lp-collage-large"><img src="/landing/photo-dining.webp" alt="A dining room with a chandelier and a large wall clock" loading="lazy" decoding="async" /></Reveal>
                <Reveal as="figure" className="lp-collage-small"><img src="/landing/photo-armchair.webp" alt="A patterned armchair beside a small table" loading="lazy" decoding="async" /></Reveal>
              </div>
              <div className="lp-stats">
                {STATS.map((stat) => (
                  <Reveal key={stat.value} className="lp-stat">
                    <p className="lp-stat-value">{stat.value}</p>
                    <p className="lp-stat-text">{stat.text}<a href={`#stat-${stat.ref}`} className="lp-ref">{stat.ref}</a></p>
                  </Reveal>
                ))}
              </div>
            </div>
            <ol className="lp-sources">
              {STAT_SOURCES.map((source, index) => (
                <li key={source.href} id={`stat-${index + 1}`}><span>{index + 1}</span><a href={source.href} target="_blank" rel="noreferrer noopener">{source.label}</a></li>
              ))}
              <li className="lp-sources-note">Industry and vendor surveys. Read them as a direction, not exact figures.</li>
            </ol>
          </div>
        </section>

        <Approach />

        <section className="lp-studio">
          <div className="lp-studio-media">
            <img src="/landing/studio-overview.webp" alt="A 3D model of a furnished three-room apartment, seen from above" loading="lazy" decoding="async" />
          </div>
          <div className="lp-studio-copy">
            <Reveal>
              <Eyebrow>The studio</Eyebrow>
              <h2 className="lp-title">Step inside <em>real</em> rooms, in true 3D.</h2>
              <p className="lp-lede">A sample apartment built from real 360° photographs, measured wall to wall and furnished at true scale. Orbit it, look from above, move anything, add or remove pieces, and ask for an architect's review.</p>
              <ul className="lp-studio-points">
                <li><Eye size={22} strokeWidth={1.3} />In the room</li>
                <li><Box size={22} strokeWidth={1.3} />Whole apartment</li>
                <li><LayoutGrid size={22} strokeWidth={1.3} />Top-down plan</li>
                <li><Compass size={22} strokeWidth={1.3} />Architect's review</li>
              </ul>
              <a className="lp-button" href="/studio" onClick={(event) => { event.preventDefault(); navigate("/studio"); }}>Enter the apartment <ArrowUpRight size={18} strokeWidth={1.5} /></a>
            </Reveal>
          </div>
        </section>

        <section id="features" className="lp-section lp-wrap">
          <Reveal>
            <Eyebrow>Features</Eyebrow>
            <h2 className="lp-title">What you can do <em>today,</em> and what comes next.</h2>
          </Reveal>
          <div className="lp-features">
            {FEATURES.map((feature) => {
              const Icon = FEATURE_ICONS[feature.icon];
              return (
                <Reveal key={feature.title} className="lp-feature">
                  <div className="lp-feature-top"><Icon size={28} strokeWidth={1.2} /><StatusTag status={feature.status} /></div>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </Reveal>
              );
            })}
          </div>
          <div className="lp-roadmap">
            {ROADMAP.map((item) => (
              <div key={item.title} className="lp-roadmap-row">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <StatusTag status={item.status} />
              </div>
            ))}
          </div>
        </section>

        <section id="stack" className="lp-stack">
          <div className="lp-wrap">
            <Reveal>
              <Eyebrow>Tech stack</Eyebrow>
              <h2 className="lp-title">Models read and suggest. <em>Geometry</em> does the measuring.</h2>
            </Reveal>
          </div>
          <div className="lp-mq-wrap">
            <Marquee items={STACK_ROWS[0]} seconds={44} />
            <Marquee items={STACK_ROWS[1]} seconds={50} reverse />
          </div>
        </section>

        <section id="compare" className="lp-section lp-wrap">
          <Reveal>
            <Eyebrow>Compared</Eyebrow>
            <h2 className="lp-title">Others sell their catalog, or a new picture of your room. We start with the piece <em>you</em> chose.</h2>
          </Reveal>
          <div className="lp-compare-scroll" tabIndex={0} role="region" aria-label="Comparison table, scrolls sideways" data-lenis-prevent-touch>
            <table className="lp-compare">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Product</span></th>
                  {COMPARE_COLUMNS.map((column) => <th key={column} scope="col">{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.name} className={row.us ? "is-us" : undefined}>
                    <th scope="row">
                      <b>{row.name}{row.refs.map((ref) => <a key={ref} href={`#cmp-${ref}`} className="lp-ref">{ref}</a>)}</b>
                      <span>{row.detail}</span>
                    </th>
                    {row.marks.map((mark, index) => <td key={index} data-label={COMPARE_COLUMNS[index]}><MarkIcon mark={mark} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lp-compare-foot">
            <ul className="lp-legend">
              <li><MarkIcon mark="yes" />Yes</li>
              <li><MarkIcon mark="part" />Partly. For Roomset: photos are the sample apartment today, and AI advice is in testing</li>
              <li><MarkIcon mark="no" />No</li>
              <li><MarkIcon mark="unknown" />Not stated in what we read</li>
            </ul>
            <ol className="lp-sources lp-sources--light">
              {COMPARE_REFS.map((source, index) => (
                <li key={source.href} id={`cmp-${index + 1}`}><span>{index + 1}</span><a href={source.href} target="_blank" rel="noreferrer noopener">{source.label}</a></li>
              ))}
              <li className="lp-sources-note">From public pages read in November 2026. Products change, so check before relying on this.</li>
            </ol>
          </div>
        </section>

        <section id="team" className="lp-team-section">
          <div className="lp-wrap">
            <Reveal>
              <Eyebrow>The team</Eyebrow>
              <h2 className="lp-title">Made by <em>two</em> people.</h2>
            </Reveal>
            <div className="lp-team">
              {TEAM.map((person) => (
                <Reveal key={person.name} className="lp-person">
                  <div className="lp-person-photo"><img src={person.photo} alt={person.name} loading="lazy" decoding="async" /></div>
                  <div className="lp-person-info">
                    <h3>{person.name}</h3>
                    <p className="lp-person-role">{person.role}</p>
                    <p className="lp-person-focus">{person.focus}</p>
                    <div className="lp-person-links">
                      {person.links.map(([label, href]) => <a key={href} href={href} target="_blank" rel="noreferrer noopener">{label} <ArrowUpRight size={15} strokeWidth={1.5} /></a>)}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-footer-cta">
            <h2>See if it <em>fits.</em></h2>
            <a className="lp-button lp-button--light" href={APP_PATH} onClick={goToApp}>Try Roomset <ArrowUpRight size={18} strokeWidth={1.5} /></a>
          </div>
          <div className="lp-footer-meta">
            <img src="/brand/logo-light.png" alt="roomset" width={132} />
            <p>Built for the Meta Global AI Developer Hackathon, 2026.</p>
            <p>{CREDITS}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
