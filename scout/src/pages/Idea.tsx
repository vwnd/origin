import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { RuleField } from "@/components/rule-field";
import { TextAnimate } from "@/components/ui/text-animate";

/**
 * The pitch.
 *
 * The team, then seven plates from the product overview, cut down to what a
 * stranger can hold: models rot, warnings don't fix anything, you approve
 * eight fixes over coffee, and the loop that does it is the product.
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

/**
 * The architecture, told as one story on one clock: a publish leaves the
 * model, lands in Speckle, wakes Origo, fans the fleet out, the scouts work
 * and file, the review approves, and the fix travels home — then the model
 * blinks fixed and the next publish begins.
 *
 * Every cube and every station reaction runs the same 10-second animation
 * cycle (`.idea-arch`), each occupying its own keyframe window, so cause
 * visibly precedes effect instead of everything flowing at once.
 */
function ArchitecturePlate() {
  // One pipe per leg of the journey, in reading order.
  const pipes = [
    "M92 128 L140 74", // model -> speckle
    "M181 62 L252 62", // speckle -> origo
    "M289 66 L343 116", // origo fans out to the fleet…
    "M291 70 L343 147",
    "M287 74 L341 176",
    "M346 124 L293 226", // …and the scouts converge on the issues
    "M349 154 L294 231",
    "M347 182 L295 235",
    "M251 238 L177 238", // issues -> review
    "M151 230 L95 158" // approved fixes -> back into the model
  ];

  // Each leg is a keyframe window on the shared cycle; the fan and the
  // convergence share theirs, so the fleet departs and reports as one.
  const relay: Array<[string, string]> = [
    [pipes[0], "idea-arch-leg-a"],
    [pipes[1], "idea-arch-leg-b"],
    [pipes[2], "idea-arch-leg-c"],
    [pipes[3], "idea-arch-leg-c"],
    [pipes[4], "idea-arch-leg-c"],
    [pipes[5], "idea-arch-leg-d"],
    [pipes[6], "idea-arch-leg-d"],
    [pipes[7], "idea-arch-leg-d"],
    [pipes[8], "idea-arch-leg-e"]
  ];

  const label = (x: number, y: number, text: string, at: number) => (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      className="idea-mono idea-rise"
      style={delay(at)}
      fill={PAPER}
    >
      {text}
    </text>
  );

  return (
    <svg viewBox="0 0 400 300" className="idea-art" aria-hidden>
      {/* model — the designer's machine; the screen fills when the fix lands */}
      <g className="idea-rise" style={delay(200)}>
        <rect
          x={40}
          y={118}
          width={48}
          height={34}
          fill="none"
          stroke={PAPER}
          strokeWidth={1.5}
        />
        <line
          x1={64}
          y1={152}
          x2={64}
          y2={160}
          stroke={PAPER}
          strokeWidth={1.5}
        />
        <line
          x1={54}
          y1={160}
          x2={74}
          y2={160}
          stroke={PAPER}
          strokeWidth={1.5}
        />
        <rect
          x={45}
          y={123}
          width={38}
          height={24}
          fill={PAPER}
          className="idea-arch idea-arch-fixed"
        />
      </g>
      {label(64, 182, "model", 260)}

      {/* speckle — blips as the publish lands */}
      <g className="idea-rise" style={delay(360)}>
        <polygon
          points="163,46 179,62 163,78 147,62"
          fill="none"
          stroke={PAPER}
          strokeWidth={1.5}
          className="idea-arch idea-arch-blip"
        />
      </g>
      {label(163, 98, "speckle", 420)}

      {/* origo — the mark; the ring pings when the notification arrives */}
      <g className="idea-rise" style={delay(520)}>
        <circle
          cx={272}
          cy={62}
          r={16}
          fill="none"
          stroke={PAPER}
          strokeWidth={1.5}
        />
        <circle cx={272} cy={62} r={4} fill={PAPER} />
      </g>
      <circle
        cx={272}
        cy={62}
        r={16}
        fill="none"
        stroke={PAPER}
        strokeWidth={1}
        className="idea-arch idea-arch-ping"
      />
      {label(272, 98, "origo", 580)}

      {/* the fleet — each scout lights up while it works the version */}
      {[112, 142, 172].map((y, i) => (
        <g key={y} className="idea-rise" style={delay(680 + i * 90)}>
          <rect
            x={346}
            y={y}
            width={12}
            height={12}
            fill="none"
            stroke={PAPER}
            strokeWidth={1.5}
          />
          <rect
            x={349.5}
            y={y + 3.5}
            width={5}
            height={5}
            fill={PAPER}
            className="idea-arch idea-arch-work"
          />
        </g>
      ))}
      {label(352, 208, "scouts", 860)}

      {/* issues — the lines brighten as the findings are filed */}
      <g className="idea-rise" style={delay(980)}>
        <rect
          x={254}
          y={222}
          width={36}
          height={32}
          fill="none"
          stroke={PAPER}
          strokeWidth={1.5}
        />
        {[230, 238, 246].map((y) => (
          <line
            key={y}
            x1={260}
            y1={y}
            x2={284}
            y2={y}
            stroke={PAPER_DIM}
            strokeWidth={1.5}
          />
        ))}
        <g className="idea-arch idea-arch-log">
          {[230, 238, 246].map((y) => (
            <line
              key={y}
              x1={260}
              y1={y}
              x2={284}
              y2={y}
              stroke={PAPER}
              strokeWidth={1.5}
            />
          ))}
        </g>
      </g>
      {label(272, 276, "issues", 1040)}

      {/* review — the check pops when the designer approves */}
      <g className="idea-rise" style={delay(1100)}>
        <rect
          x={155}
          y={230}
          width={16}
          height={16}
          fill="none"
          stroke={PAPER}
          strokeWidth={1.5}
        />
        <polyline
          points="158.5,238 161.5,241.5 167.5,233.5"
          fill="none"
          stroke={PAPER}
          strokeWidth={1.5}
          className="idea-arch idea-arch-check"
        />
      </g>
      {label(163, 276, "review", 1160)}

      {/* the pipes, drawn in journey order */}
      {pipes.map((d, i) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={PAPER_DIM}
          strokeWidth={1.5}
          pathLength={1}
          className="idea-draw"
          style={delay(400 + i * 110)}
        />
      ))}

      {/* the data itself, one parcel per leg */}
      {relay.map(([d, leg], i) => (
        <rect
          key={i}
          x={-2.75}
          y={-2.75}
          width={5.5}
          height={5.5}
          fill={PAPER}
          className={`idea-cube idea-arch ${leg}`}
          style={{ "--path": `path("${d}")` } as CSSProperties}
        />
      ))}

      {/* the approved fix travels home bigger and brighter than raw data */}
      <rect
        x={-3.75}
        y={-3.75}
        width={7.5}
        height={7.5}
        fill="#ebe8e1"
        className="idea-cube idea-arch idea-arch-leg-f"
        style={{ "--path": `path("${pipes[9]}")` } as CSSProperties}
      />
    </svg>
  );
}

/**
 * The system — a colleague's design, integrated as a guest slide: blue ink
 * on the sheet's own paper instead of paper on a blue plate, so it renders
 * full-bleed (`full: true`) rather than through the copy + plate split.
 * Five stations on the loop, with an honest built/designed legend: filled
 * blue nodes exist, hollow ones are designed but not yet built.
 */
type SystemStation = {
  /** The numbered tag line, status included when it has one. */
  tag: string;
  title: string;
  sub: string;
  built: boolean;
  /** Degrees on the ring, 0 = east, counter-clockwise. */
  angle: number;
};

const SYSTEM_STATIONS: SystemStation[] = [
  {
    tag: "01",
    title: "Capture & transport",
    sub: "parameters only — geometry never fetched\n863 MB → 122.5 MB",
    built: true,
    angle: 90
  },
  {
    tag: "02 · customer-owned",
    title: "Knowledge layer",
    sub: "the firm's own standards, in markdown",
    built: false,
    angle: 18
  },
  {
    tag: "03",
    title: "Agent fleet",
    sub: "scouts scope themselves · the model judges one histogram",
    built: true,
    angle: -54
  },
  {
    tag: "04",
    title: "Delivery & approval",
    sub: "a Speckle issue → a change request in Revit",
    built: true,
    angle: 234
  },
  {
    tag: "05 · designed",
    title: "Feedback loop",
    sub: "rejections rewrite the standards",
    built: false,
    angle: 162
  }
];

const SYSTEM_R = 100;

function SystemPlate() {
  const point = (angle: number, radius: number) => {
    const rad = (angle * Math.PI) / 180;
    return { x: Math.cos(rad) * radius, y: -Math.sin(rad) * radius };
  };

  return (
    <div className="idea-system">
      <div className="idea-system-ring">
        <svg viewBox="-132 -132 264 264" className="size-full" aria-hidden>
          <circle
            r={76}
            fill="none"
            stroke="rgba(35, 35, 230, 0.3)"
            strokeWidth={1}
            strokeDasharray="1 6"
            strokeLinecap="round"
          />
          <circle
            r={SYSTEM_R}
            fill="none"
            stroke="var(--blue)"
            strokeWidth={1.5}
            pathLength={1}
            className="idea-draw idea-draw-slow"
            style={delay(200)}
          />
          {/* Clockwise arrowheads between stations. The positioning lives on
              a wrapper group: a CSS entrance animation on the path itself
              would override an attribute transform and dump every arrow at
              the origin. */}
          {[54, -18, -90, 126, 198].map((angle) => {
            const at = point(angle, SYSTEM_R);
            const rad = (angle * Math.PI) / 180;
            const rot =
              (Math.atan2(Math.cos(rad), Math.sin(rad)) * 180) / Math.PI;
            return (
              <g
                key={angle}
                transform={`translate(${at.x} ${at.y}) rotate(${rot})`}
              >
                <path
                  d="M-5 -3.5 L3 0 L-5 3.5"
                  fill="none"
                  stroke="var(--blue)"
                  strokeWidth={1.5}
                  className="idea-rise"
                  style={delay(1000)}
                />
              </g>
            );
          })}
          {/* flanking ticks: the loop keeps moving past every station */}
          {SYSTEM_STATIONS.flatMap((station) =>
            [-11, 11].map((offset) => {
              const from = point(station.angle + offset, SYSTEM_R + 8);
              const to = point(station.angle + offset, SYSTEM_R + 17);
              return (
                <line
                  key={`${station.angle}-${offset}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="rgba(35, 35, 230, 0.3)"
                  strokeWidth={1.5}
                />
              );
            })
          )}
          {/* The loop, alive: a fix in transit, orbiting clockwise under the
              stations. Inherited from the retired "Why now" plate — the same
              dot, now travelling the system that carries it. */}
          <g className="idea-orbit">
            <circle cx={0} cy={-SYSTEM_R} r={4.5} fill="var(--blue)" />
          </g>
          {SYSTEM_STATIONS.map((station, i) => {
            const at = point(station.angle, SYSTEM_R);
            return (
              <g
                key={station.title}
                className="idea-pop"
                style={delay(500 + i * 120)}
              >
                {station.built ? (
                  <circle cx={at.x} cy={at.y} r={9} fill="var(--blue)" />
                ) : (
                  <circle
                    cx={at.x}
                    cy={at.y}
                    r={9}
                    fill="var(--paper)"
                    stroke="rgba(22, 24, 28, 0.35)"
                    strokeWidth={2}
                  />
                )}
                {/* Designed stations breathe: not built yet, but coming. */}
                {!station.built && (
                  <circle
                    cx={at.x}
                    cy={at.y}
                    r={9}
                    fill="none"
                    stroke="rgba(22, 24, 28, 0.3)"
                    strokeWidth={1}
                    className="idea-pulse"
                    style={delay(1800 + i * 900)}
                  />
                )}
              </g>
            );
          })}
        </svg>
        <p className="idea-system-center idea-rise" style={delay(700)}>
          The loop is the product
        </p>
      </div>

      {SYSTEM_STATIONS.map((station, i) => (
        <div
          key={station.title}
          className={`idea-system-station idea-system-s${i + 1} idea-rise`}
          style={delay(300 + i * 130)}
        >
          <p
            className={
              station.built
                ? "idea-system-tag"
                : "idea-system-tag idea-system-dim"
            }
          >
            {station.tag}
          </p>
          <p
            className={
              station.built
                ? "idea-system-title"
                : "idea-system-title idea-system-dim"
            }
          >
            {station.title}
          </p>
          <p className="idea-system-sub">{station.sub}</p>
        </div>
      ))}
    </div>
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
  /** Full-bleed on the sheet's paper, no copy + plate split. */
  full?: boolean;
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
    statement: "Revit already warns. Nobody cares to fix.",
    note: "Hundreds of untriaged warnings per project, and every checker on the market stops exactly where the work begins. Knowing is solved. Doing is not.",
    plate: WarningsPlate
  },
  {
    eyebrow: "03 — What you get",
    statement: "Eight fixes on your desk every morning.",
    note: "Each one names the element, the current value, the proposed value and a one-line why. Approve most, send a few back with a reason. About five minutes.",
    plate: MorningPlate
  },
  {
    eyebrow: "04 — Trust",
    statement: "Nothing touches the model but you.",
    note: "Human approval is the only write path, capped at ten proposals a day. The cap is a feature — a reviewer trained to bulk-approve would kill the product.",
    plate: TrustPlate
  },
  {
    eyebrow: "05 — The architecture",
    statement: "Publish the model. The fleet does the rest.",
    note: "A publish lands in Speckle and wakes Origo. Scouts fan out over the version, file what they find as issues with the fixes pre-drafted, and you review them in Origo. Only what you approve flows back — the next publish comes back fixed.",
    plate: ArchitecturePlate
  },
  {
    eyebrow: "06 — The system",
    statement: "The loop is the product.",
    note: "Five stations; three built, two designed — the honesty is the point.",
    plate: SystemPlate,
    full: true
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
  const [searchParams, setSearchParams] = useSearchParams();
  // `?slide=N` deep-links a slide, 1-based to match the on-screen counter.
  const [index, setIndex] = useState(() => {
    const slide = Number(searchParams.get("slide"));
    return Number.isInteger(slide)
      ? Math.max(0, Math.min(SLIDES.length - 1, slide - 1))
      : 0;
  });
  const [leaving, setLeaving] = useState(false);
  const target = useRef(0);
  const timer = useRef<number>(undefined);

  // Keep the URL shareable as the deck advances. Replace, not push — the
  // back button should leave the deck, not replay it slide by slide.
  useEffect(() => {
    setSearchParams(index === 0 ? {} : { slide: String(index + 1) }, {
      replace: true
    });
  }, [index, setSearchParams]);

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
          className={[
            "idea-slide",
            slide.full && "idea-slide-bare",
            leaving && "idea-slide-leaving"
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {slide.full ? (
            <>
              <div className="idea-system-head">
                <p className="idea-eyebrow idea-rise" style={delay(0)}>
                  {slide.eyebrow}
                </p>
                <p className="idea-system-legend idea-rise" style={delay(140)}>
                  <span className="idea-system-built">● built</span>
                  <span className="idea-system-designed">○ designed</span>
                </p>
              </div>
              <Plate />
            </>
          ) : (
            <>
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
            </>
          )}
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
