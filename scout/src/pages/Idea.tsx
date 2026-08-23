import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { RuleField } from "@/components/rule-field";
import { TextAnimate } from "@/components/ui/text-animate";

/**
 * The pitch.
 *
 * The team, then nine plates from the product overview, cut down to what a
 * stranger can hold: models rot, warnings don't fix anything, judgment just
 * became automatable, the loop closes, you approve eight fixes over coffee.
 * Same sheet as the landing page — paper, ink, one blue — with one drawing
 * per slide doing the work a paragraph would otherwise do.
 */

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

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

/* ------------------------------------------------------------------ */
/* Plates — one drawing per slide, paper strokes on the blue.          */
/* ------------------------------------------------------------------ */

const PAPER = "rgba(235, 232, 225, 0.9)";
const PAPER_DIM = "rgba(235, 232, 225, 0.32)";
const INK = "rgba(22, 24, 28, 0.9)";

/** Cover: the landing page's rule field, unchanged. It is the product. */
function CoverPlate() {
  return <RuleField className="size-full" />;
}

const TEAM = [
  {
    name: "Victor Barbosa",
    firm: "Schmidt Hammer Lassen",
    src: "/victor-barbosa.jpg"
  },
  {
    name: "Qianyi Huang",
    firm: "Throughline Studio",
    src: "/qianyi-huang.jpg"
  },
  { name: "Jack Walker", firm: "Prospect Studio", src: "/jack-walker.jpg" },
  { name: "Mike Daley", firm: "Perkins&Will", src: "/mike-daley.png" }
];

/** The team, printed in the sheet's own ink: blue-toned portraits on the plate. */
function TeamPlate() {
  return (
    <div className="idea-team">
      {/* The rise animates the image and caption themselves: an animated
          ancestor would isolate the luminosity blend from the plate's blue. */}
      {TEAM.map((person, i) => (
        <figure key={person.name} className="idea-team-cell">
          <img
            src={person.src}
            alt={person.name}
            className="idea-team-photo idea-rise"
            style={delay(200 + i * 120)}
          />
          <figcaption
            className="idea-team-caption idea-rise"
            style={delay(320 + i * 120)}
          >
            <span className="idea-team-name">{person.name}</span>
            <span className="idea-team-firm">{person.firm}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/**
 * Entropy: a field of ticks holding a grid, and a handful that have quietly
 * stopped holding it. The drift arrives over seconds — rot, not an explosion.
 */
function EntropyPlate() {
  const drifted = new Map<string, { tilt: number; at: number }>([
    ["2-1", { tilt: 34, at: 600 }],
    ["9-2", { tilt: -26, at: 1400 }],
    ["5-4", { tilt: 42, at: 2200 }],
    ["11-5", { tilt: -38, at: 3000 }],
    ["3-6", { tilt: 24, at: 3800 }],
    ["7-3", { tilt: -32, at: 4600 }],
    ["12-6", { tilt: 30, at: 5400 }],
    ["1-3", { tilt: -22, at: 6200 }]
  ]);

  return (
    <svg viewBox="0 0 400 300" className="idea-art" aria-hidden>
      {Array.from({ length: 8 }, (_, row) =>
        Array.from({ length: 14 }, (_, col) => {
          const drift = drifted.get(`${col}-${row}`);
          const x = 31 + col * 26;
          const y = 22 + row * 33;
          return (
            <line
              key={`${col}-${row}`}
              x1={x}
              y1={y}
              x2={x}
              y2={y + 16}
              stroke={drift ? INK : PAPER_DIM}
              strokeWidth={drift ? 2.5 : 1.5}
              className={drift ? "idea-tilt" : undefined}
              style={
                drift
                  ? ({
                      "--tilt": `${drift.tilt}deg`,
                      "--d": `${drift.at}ms`
                    } as CSSProperties)
                  : undefined
              }
            />
          );
        })
      )}
    </svg>
  );
}

/** An endless scroll of warnings, and a count with no owner attached. */
function WarningsPlate() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 2400);
      setCount(Math.round(874 * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const widths = [
    62, 45, 71, 38, 55, 66, 42, 58, 49, 68, 36, 60, 52, 44, 64, 40, 57, 47
  ];

  return (
    <div className="idea-warnings" aria-hidden>
      <div className="idea-warn-scroll">
        {[0, 1].map((copy) => (
          <div key={copy} className="idea-warn-list">
            {widths.map((width, i) => (
              <div key={i} className="idea-warn-row">
                <span className="idea-warn-index">
                  {String(copy * widths.length + i + 1).padStart(3, "0")}
                </span>
                <span
                  className="idea-warn-line"
                  style={{ width: `${width}%` }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="idea-warn-count">
        {count.toLocaleString()} warnings · 0 owners
      </p>
    </div>
  );
}

/** Four spellings converge on the one rating they always were. */
function JudgePlate() {
  const variants = ["4 HR", "4hr", "240 min", "4 hours"];

  return (
    <svg viewBox="0 0 400 300" className="idea-art" aria-hidden>
      {variants.map((label, i) => {
        const y = 68 + i * 55;
        return (
          <g key={label}>
            <text
              x={56}
              y={y + 4}
              className="idea-mono idea-rise"
              style={delay(300 + i * 140)}
              fill={PAPER}
            >
              {label}
            </text>
            <line
              x1={150}
              y1={y}
              x2={258}
              y2={150}
              stroke={PAPER_DIM}
              strokeWidth={1.5}
              pathLength={1}
              className="idea-draw"
              style={delay(700 + i * 140)}
            />
          </g>
        );
      })}
      <circle
        cx={296}
        cy={150}
        r={37}
        fill={PAPER}
        className="idea-pop"
        style={delay(1500)}
      />
      <text
        x={296}
        y={155}
        textAnchor="middle"
        className="idea-mono idea-rise"
        style={delay(1650)}
        fill="#2323e6"
      >
        4 HR
      </text>
    </svg>
  );
}

/** The loop, with a fix actually travelling around it. */
function LoopPlate() {
  const stations: Array<[string, number, number]> = [
    ["detect", 200, 34],
    ["judge", 337, 122],
    ["draft", 288, 268],
    ["deliver", 112, 268],
    ["approve", 63, 122]
  ];

  return (
    <svg viewBox="0 0 400 300" className="idea-art" aria-hidden>
      <circle
        cx={200}
        cy={150}
        r={95}
        fill="none"
        stroke={PAPER_DIM}
        strokeWidth={1.5}
        strokeDasharray="1 7"
        strokeLinecap="round"
      />
      {stations.map(([label, x, y], i) => (
        <text
          key={label}
          x={x}
          y={y}
          textAnchor="middle"
          className="idea-mono idea-rise"
          style={delay(300 + i * 130)}
          fill={PAPER}
        >
          {label}
        </text>
      ))}
      <g className="idea-orbit">
        <circle cx={200} cy={55} r={5.5} fill={PAPER} />
      </g>
      <circle cx={200} cy={150} r={4} fill={PAPER_DIM} />
    </svg>
  );
}

/** The morning inbox: eight rows, seven approved, one sent back. */
function MorningPlate() {
  const widths = [188, 152, 214, 164, 196, 142, 206, 172];
  const rejected = 5;

  return (
    <svg viewBox="0 0 400 300" className="idea-art" aria-hidden>
      {widths.map((width, i) => {
        const y = 36 + i * 31;
        const isRejected = i === rejected;
        return (
          <g key={i}>
            <g className="idea-rise" style={delay(200 + i * 90)}>
              <rect
                x={48}
                y={y}
                width={12}
                height={12}
                fill="none"
                stroke={PAPER}
                strokeWidth={1.5}
              />
              <line
                x1={76}
                y1={y + 6}
                x2={76 + width}
                y2={y + 6}
                stroke={PAPER_DIM}
                strokeWidth={2}
              />
            </g>
            {isRejected ? (
              <g className="idea-pop" style={delay(1200 + i * 90)}>
                <line
                  x1={50.5}
                  y1={y + 2.5}
                  x2={57.5}
                  y2={y + 9.5}
                  stroke={INK}
                  strokeWidth={2}
                />
                <line
                  x1={57.5}
                  y1={y + 2.5}
                  x2={50.5}
                  y2={y + 9.5}
                  stroke={INK}
                  strokeWidth={2}
                />
              </g>
            ) : (
              <rect
                x={51}
                y={y + 3}
                width={6}
                height={6}
                fill={PAPER}
                className="idea-pop"
                style={delay(1200 + i * 90)}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** The cap: ten slots for the day, eight spoken for, two left empty. */
function TrustPlate() {
  return (
    <svg viewBox="0 0 400 300" className="idea-art" aria-hidden>
      <line
        x1={44}
        y1={58}
        x2={356}
        y2={58}
        stroke={PAPER_DIM}
        strokeWidth={1}
      />
      <text
        x={44}
        y={44}
        className="idea-mono idea-rise"
        style={delay(300)}
        fill={PAPER}
      >
        max 10 / day
      </text>
      {Array.from({ length: 10 }, (_, i) => {
        const x = 46 + i * 32;
        return (
          <g key={i}>
            <rect
              x={x}
              y={70}
              width={18}
              height={172}
              fill="none"
              stroke={PAPER_DIM}
              strokeWidth={1}
            />
            {i < 8 && (
              <rect
                x={x + 4}
                y={74}
                width={10}
                height={164}
                fill={PAPER}
                className="idea-grow"
                style={delay(500 + i * 110)}
              />
            )}
          </g>
        );
      })}
      <text
        x={356}
        y={266}
        textAnchor="end"
        className="idea-mono idea-rise"
        style={delay(1600)}
        fill={PAPER}
      >
        8 proposed · room to say no
      </text>
    </svg>
  );
}

/** A standards document writing itself, one rejection at a time. */
function CompoundPlate() {
  const lines = [130, 96, 118, 84, 110, 122, 90, 104, 116, 78];

  return (
    <svg viewBox="0 0 400 300" className="idea-art" aria-hidden>
      <rect
        x={110}
        y={28}
        width={180}
        height={244}
        fill="none"
        stroke={PAPER}
        strokeWidth={1.5}
        className="idea-rise"
        style={delay(200)}
      />
      <line
        x1={132}
        y1={56}
        x2={236}
        y2={56}
        stroke={PAPER}
        strokeWidth={3}
        className="idea-write"
        style={delay(500)}
      />
      {lines.map((width, i) => (
        <line
          key={i}
          x1={132}
          y1={82 + i * 17}
          x2={132 + width}
          y2={82 + i * 17}
          stroke={PAPER_DIM}
          strokeWidth={2}
          className="idea-write"
          style={delay(700 + i * 130)}
        />
      ))}
      <g className="idea-pop" style={delay(2100)}>
        <circle
          cx={262}
          cy={250}
          r={9}
          fill="none"
          stroke={PAPER}
          strokeWidth={1.5}
        />
        <circle cx={262} cy={250} r={2.5} fill={PAPER} />
      </g>
    </svg>
  );
}

/** The mark, drawn in front of the reader: a circle and its origin. */
function ClosePlate() {
  return (
    <svg viewBox="0 0 400 300" className="idea-art" aria-hidden>
      <circle
        cx={200}
        cy={150}
        r={82}
        fill="none"
        stroke={PAPER}
        strokeWidth={1.5}
        pathLength={1}
        className="idea-draw idea-draw-slow"
        style={delay(300)}
      />
      <circle
        cx={200}
        cy={150}
        r={22}
        fill={PAPER}
        className="idea-pop"
        style={delay(1100)}
      />
      <circle
        cx={200}
        cy={150}
        r={82}
        fill="none"
        stroke={PAPER_DIM}
        strokeWidth={1}
        className="idea-pulse"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* The deck.                                                           */
/* ------------------------------------------------------------------ */

type Slide = {
  eyebrow: string;
  statement: string;
  note: ReactNode;
  plate: () => ReactNode;
  cta?: boolean;
};

/*
 * Every claim below is lifted from product-overview.md and cut to pitch
 * length. The overview argues; the deck states.
 */
const SLIDES: Slide[] = [
  {
    eyebrow: "Origo — the team",
    statement: "We are team Origo.",
    note: "We have seen how bad models can get, and how much time is wasted fixing them manually.",
    plate: TeamPlate
  },
  {
    eyebrow: "Origo — the idea",
    statement: "We don't review models. We fix them.",
    note: "A fleet of agents that does daily maintenance on your building models — and hands you the fixes, not another report.",
    plate: CoverPlate
  },
  {
    eyebrow: "01 — The problem",
    statement: "Models rot daily. Cleanup happens quarterly.",
    note: "Duplicate marks, rooms named five different ways, “2 HR” next to “120 min”. None of it stops work today. All of it breaks schedules, exports and permit sets later.",
    plate: EntropyPlate
  },
  {
    eyebrow: "02 — The gap",
    statement: "Revit already warns. Nobody owns the list.",
    note: "Hundreds of untriaged warnings per project, and every checker on the market stops exactly where the work begins. Knowing is solved. Doing is not.",
    plate: WarningsPlate
  },
  {
    eyebrow: "03 — Why rules can't fix it",
    statement: "Four strings. One fire rating.",
    note: "Rule engines compare text, so “4 HR”, “4hr”, “240 min” and “4 hours” are four different values. Telling a convention from a violation takes judgment — and judgment just became automatable.",
    plate: JudgePlate
  },
  {
    eyebrow: "04 — Why now",
    statement: "The loop finally closes.",
    note: "Agents make the call. Speckle delivers the fix into Revit as a change request you accept with a click. Rejections flow back and teach the fleet.",
    plate: LoopPlate
  },
  {
    eyebrow: "05 — What you get",
    statement: "Eight fixes on your desk every morning.",
    note: "Each one names the element, the current value, the proposed value and a one-line why. Approve most, send a few back with a reason. About five minutes.",
    plate: MorningPlate
  },
  {
    eyebrow: "06 — Trust",
    statement: "Nothing touches the model but you.",
    note: "Human approval is the only write path, capped at ten proposals a day. The cap is a feature — a reviewer trained to bulk-approve would kill the product.",
    plate: TrustPlate
  },
  {
    eyebrow: "07 — The compounding part",
    statement: "Using it writes your standards down.",
    note: "Every rejection becomes a durable exception; three of a kind revise the convention itself. The fleet gets better at your firm, not at models in general.",
    plate: CompoundPlate
  },
  {
    eyebrow: "Origo",
    statement: "Daily maintenance. Not cleanup sprints.",
    note: "Small, reviewable, pre-drafted, human-approved.",
    plate: ClosePlate,
    cta: true
  }
];

/** Exit is shorter than entrance — nobody needs to watch a slide leave. */
const EXIT = 220;

export function Idea() {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const target = useRef(0);
  const timer = useRef<number>(undefined);

  useEffect(() => {
    document.documentElement.classList.add("origo-paper");
    return () => {
      document.documentElement.classList.remove("origo-paper");
      window.clearTimeout(timer.current);
    };
  }, []);

  /*
   * Two-phase swap, the same shape as the landing page's statement: the old
   * slide accelerates away, then the new one mounts and its entrance cascade
   * plays. A click mid-exit just retargets the pending swap.
   */
  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(SLIDES.length - 1, next));
      if (clamped === (leaving ? target.current : index)) return;
      target.current = clamped;

      if (reduced) {
        setIndex(clamped);
        return;
      }

      setLeaving(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setIndex(target.current);
        setLeaving(false);
      }, EXIT);
    },
    [index, leaving, reduced]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowRight":
        case " ":
          event.preventDefault();
          go(index + 1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          go(index - 1);
          break;
        case "Home":
          go(0);
          break;
        case "End":
          go(SLIDES.length - 1);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  const slide = SLIDES[index]!;
  const Plate = slide.plate;

  return (
    <div className="idea-sheet">
      <header className="idea-head">
        <Link to="/" className="idea-wordmark">
          Origo
        </Link>
        <span className="idea-head-label">The idea — a short pitch</span>
      </header>

      <div className="idea-stage">
        <section
          key={index}
          className={leaving ? "idea-slide idea-slide-leaving" : "idea-slide"}
        >
          <div className="idea-copy">
            <p className="idea-eyebrow idea-rise" style={delay(0)}>
              {slide.eyebrow}
            </p>

            {reduced ? (
              <h1 className="idea-statement">{slide.statement}</h1>
            ) : (
              <TextAnimate
                as="h1"
                className="idea-statement"
                animation="blurInUp"
                by="word"
                duration={0.6}
                delay={0.12}
                startOnView={false}
                once
              >
                {slide.statement}
              </TextAnimate>
            )}

            <p className="idea-note idea-rise" style={delay(420)}>
              {slide.note}
            </p>

            {slide.cta && (
              <div className="idea-rise" style={delay(640)}>
                <Link to="/inbox" className="origo-cta">
                  Open Inbox
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            )}
          </div>

          <div className="idea-plate idea-rise" style={delay(120)}>
            <Plate />
          </div>
        </section>
      </div>

      <footer className="idea-foot">
        <div className="idea-foot-nav">
          <button
            type="button"
            className="idea-arrow"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            aria-label="Previous slide"
          >
            <ArrowLeft className="size-4" />
          </button>
          <button
            type="button"
            className="idea-arrow"
            onClick={() => go(index + 1)}
            disabled={index === SLIDES.length - 1}
            aria-label="Next slide"
          >
            <ArrowRight className="size-4" />
          </button>
        </div>

        <div className="idea-ticks" role="tablist" aria-label="Slides">
          {SLIDES.map((entry, i) => (
            <button
              key={entry.eyebrow}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Slide ${i + 1}: ${entry.statement}`}
              className={
                i === index ? "idea-tick idea-tick-active" : "idea-tick"
              }
              onClick={() => go(i)}
            />
          ))}
        </div>

        <p className="idea-count">
          {String(index + 1).padStart(2, "0")} /{" "}
          {String(SLIDES.length).padStart(2, "0")}
        </p>
      </footer>
    </div>
  );
}
