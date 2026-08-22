import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { FLAGGED, RuleField } from "@/components/rule-field";
import { TextAnimate } from "@/components/ui/text-animate";

/**
 * The way in.
 *
 * Laid out as a briefing sheet rather than a landing page: a plate, a caption
 * under it, a statement set large, and a note in the margin. The plate is the
 * product — a field of parameter values with three that break the pattern —
 * and the statement is the only thing that moves.
 */

/*
 * The statements are drawn from the real failure modes in the parameter-
 * consistency instruction, because an actual example lands harder than a
 * claim. They run in order and end on the one that hands over to the button.
 */
const LINES = [
  "Four hundred walls say 4 HR. One says 4 hours.",
  "Terrazo. Terrazzo. TBD. Pick one.",
  "Clash detection never had an opinion about spelling.",
  "Nobody reads twelve thousand parameter values. Something should."
];

/** How long a statement holds before it leaves. */
const HOLD = 5200;
/** Exit is shorter than entrance — nobody needs to watch a line leave. */
const EXIT = 400;
/** The first statement arrives after the plate has finished drawing. */
const FIRST_LINE = 1180;

const delay = (ms: number) => ({ "--origo-delay": `${ms}ms` }) as CSSProperties;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * One statement at a time, in order. The swap is two-phase so the outgoing
 * line accelerates away before the incoming one sets word by word, rather than
 * the two crossing over each other.
 */
function Statement() {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const start = setTimeout(() => setReady(true), FIRST_LINE);
    return () => clearTimeout(start);
  }, [reduced]);

  useEffect(() => {
    if (reduced || !ready || !visible) return;
    const hold = setTimeout(() => setVisible(false), HOLD);
    return () => clearTimeout(hold);
  }, [reduced, ready, visible, index]);

  useEffect(() => {
    if (reduced || visible) return;
    const swap = setTimeout(() => {
      setIndex((current) => (current + 1) % LINES.length);
      setVisible(true);
    }, EXIT);
    return () => clearTimeout(swap);
  }, [reduced, visible]);

  if (reduced) {
    return (
      <p className="origo-statement">
        <span className="origo-statement-box">{LINES[0]}</span>
      </p>
    );
  }

  return (
    <div className="origo-statement">
      {ready && (
        <div
          className="origo-statement-box"
          style={{
            opacity: visible ? 1 : 0,
            // No transition on the way in: TextAnimate owns the entrance.
            transition: visible
              ? "none"
              : `opacity ${EXIT}ms cubic-bezier(0.3, 0, 1, 1)`
          }}
        >
          <TextAnimate
            key={index}
            animation="blurInUp"
            by="word"
            duration={0.8}
          >
            {LINES[index]!}
          </TextAnimate>
        </div>
      )}
    </div>
  );
}

/** Origo: a circle and the point it is measured from. */
function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="#2323e6" />
      <circle cx="16" cy="16" r="4" fill="#2323e6" />
    </svg>
  );
}

export function Landing() {
  useEffect(() => {
    document.documentElement.classList.add("origo-paper");
    return () => document.documentElement.classList.remove("origo-paper");
  }, []);

  return (
    <div className="origo-sheet">
      <section className="origo-plate-column">
        <div className="origo-plate">
          <RuleField className="size-full" />
          <span className="origo-wordmark origo-in" style={delay(560)}>
            Origo
          </span>
        </div>

        <div className="origo-foot">
          <p className="origo-caption origo-in" style={delay(900)}>
            Fig. 1 — one parameter, every value in the version
            <br />
            {FLAGGED} rules in black are flagged
          </p>

          <Statement />

          <div className="origo-in" style={delay(1320)}>
            <Link to="/inbox" className="origo-cta">
              Open Inbox
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <aside className="origo-margin">
        {/* The strike draws itself a beat after the words land: Origo does not
            stop at telling you what is wrong. */}
        <h1 className="origo-lede origo-in" style={delay(680)}>
          Model
          <br />
          <span className="origo-strike">reviews</span>
          <br />
          fixes.
        </h1>

        <div className="origo-margin-foot">
          <hr className="origo-rule origo-in" style={delay(1020)} />

          <p className="origo-note origo-in" style={delay(1120)}>
            Notes on misspellings, notation drift, unit mismatches, and the
            placeholder values that quietly break every schedule downstream.
          </p>

          <div className="origo-mark origo-in" style={delay(1400)}>
            <Mark />
          </div>
        </div>
      </aside>
    </div>
  );
}
