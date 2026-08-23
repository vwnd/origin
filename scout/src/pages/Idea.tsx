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
const BLUE = "#2323e6";
/* Ink is always the defect being pointed at — the dead-end dot, the open ends
   of the two half-loops. Never decoration, never the only stroke on blue. */
const INK = "#16181c";

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
        x={46}
        y={266}
        className="idea-mono idea-rise"
        style={delay(1600)}
        fill={PAPER}
      >
        8 proposed · room to say no
      </text>
      <text
        x={46}
        y={288}
        className="idea-mono idea-rise"
        style={delay(1720)}
        fill={PAPER_DIM}
      >
        two slots left empty on purpose
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
              stations on an offset-path — the same mechanism that moves the
              architecture plate's cubes, which transform-origin quirks and a
              stalled SMIL clock cannot touch. */}
          <circle r={4.5} fill="var(--blue)" className="idea-system-dot" />
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

/** The recording, filling the plate: the pitch that survives a dead demo. */
function RecordingPlate() {
  return (
    <iframe
      className="idea-art idea-recording"
      src="https://www.tella.tv/video/vid_cmt5w752100hb0ajaaz4t3klk/embed?b=0&title=0&a=1&loop=0&t=0&muted=0&wt=0&o=1"
      title="Origo — recorded presentation"
      allow="autoplay; fullscreen"
      allowTransparency
    />
  );
}

/* ------------------------------------------------------------------ */
/* Plates ported from the pitch deck.                                  */
/*                                                                     */
/* The deck is authored at a fixed 1920×1080 slide box read across a   */
/* room; this page is responsive and read from 60cm. What crosses over */
/* is composition, hierarchy and geometry — arc radii, sweep flags and */
/* tick counts are reproduced exactly, while the type sizes stay on    */
/* this page's own scale.                                              */
/* ------------------------------------------------------------------ */

/** Sets a bar's height as a variable, so a stacked phone layout can override
    what an inline height would have nailed down. */
const height = (value: string) => ({ "--h": value }) as CSSProperties;

/**
 * The mark: a ring with a deliberate 40° gap at the top — centre (50,50),
 * r=40, running clockwise 320° from 20° to 340°. The loop that isn't closed
 * yet, and the O of the wordmark.
 *
 * On paper it must be blue; on a blue plate it must be paper, because ink as
 * a clean stroke on blue reads as a hole rather than a mark.
 */
function LoopMark({ size, weight }: { size: string; weight: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden
      className="idea-loop"
      style={{ width: size, height: size }}
    >
      <path
        d="M63.7 12.4 A 40 40 0 1 1 36.3 12.4"
        fill="none"
        stroke="currentColor"
        strokeWidth={weight}
        strokeLinecap="round"
        pathLength={1}
        className="idea-draw idea-draw-slow"
        style={delay(200)}
      />
    </svg>
  );
}

/*
 * One chart, drawn twice. The problem slide runs it with the sawtooth as the
 * hero; `07 — What changes` reprises the identical path data with the
 * emphasis inverted, so the audience recognises the chart and sees only the
 * weight move.
 */
const SAWTOOTH =
  "M0 430 L250 150 L262 400 L512 110 L524 385 L774 70 L786 370 L1060 40";
const FLAT =
  "M0 430 C 120 424, 240 432, 360 426 C 480 420, 600 430, 720 424 C 840 418, 950 428, 1060 422";

function EntropyChart({
  hero,
  stretch = false
}: {
  hero: "rot" | "flat";
  stretch?: boolean;
}) {
  const rot = hero === "rot";
  return (
    <svg
      viewBox="0 0 1120 480"
      // Stretched into a band the strokes would thin with the box, so they
      // opt out of the scale; the dots only exist on the unstretched chart.
      preserveAspectRatio={stretch ? "none" : undefined}
      vectorEffect={stretch ? "non-scaling-stroke" : undefined}
      className="idea-chart-svg"
      aria-hidden
    >
      <line
        x1={0}
        y1={440}
        x2={1120}
        y2={440}
        stroke="rgba(22, 24, 28, 0.22)"
        strokeWidth={2}
        vectorEffect={stretch ? "non-scaling-stroke" : undefined}
      />
      {rot && (
        <path
          d={`${SAWTOOTH} L1060 440 L0 440 Z`}
          fill={BLUE}
          fillOpacity={0.13}
          className="idea-rise"
          style={delay(420)}
        />
      )}
      <path
        d={SAWTOOTH}
        fill="none"
        stroke={rot ? BLUE : "rgba(22, 24, 28, 0.2)"}
        strokeWidth={rot ? 4 : 3}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect={stretch ? "non-scaling-stroke" : undefined}
        pathLength={stretch ? undefined : 1}
        className={stretch ? "idea-rise" : "idea-draw idea-draw-slow"}
        style={delay(rot ? 200 : 260)}
      />
      <path
        d={FLAT}
        fill="none"
        stroke={rot ? "rgba(22, 24, 28, 0.4)" : BLUE}
        strokeWidth={rot ? 4 : 6}
        strokeLinecap="round"
        vectorEffect={stretch ? "non-scaling-stroke" : undefined}
        pathLength={stretch ? undefined : 1}
        className={stretch ? "idea-rise" : "idea-draw idea-draw-slow"}
        style={delay(rot ? 780 : 420)}
      />
    </svg>
  );
}

/** The three sawtooth peaks, as a share of the 1120×480 chart box. They are
    drawn over the chart rather than in it, so stretching the box to fill a
    plate leaves them round. */
const PEAKS: Array<[number, number]> = [
  [22.86, 57.29],
  [46.25, 51.67],
  [69.64, 45.83]
];

/**
 * The one inverted plate in the deck: blue spikes on the sheet's own paper,
 * because blue on blue lost the reading. Rot arrives every day; cleanup
 * arrives three times a year, and the gap between the two curves is the cost.
 */
function EntropyChartPlate() {
  return (
    <div className="idea-chart-plate">
      <p className="idea-label idea-rise" style={delay(200)}>
        Issue count over one project year
      </p>
      <div className="idea-chart idea-chart--fill">
        <EntropyChart hero="rot" stretch />
        <div className="idea-chart-labels">
          {PEAKS.map(([left, top], i) => (
            <span
              key={left}
              className="idea-chart-dot idea-pop"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                ...delay(1200 + i * 110)
              }}
            />
          ))}
          <span
            className="idea-chart-tag idea-chart-tag--in idea-rise"
            style={delay(900)}
          >
            entropy in, every day
          </span>
          <span
            className="idea-chart-tag idea-chart-tag--p1 idea-rise"
            style={delay(1300)}
          >
            crunch
          </span>
          <span
            className="idea-chart-tag idea-chart-tag--p2 idea-rise"
            style={delay(1410)}
          >
            crunch
          </span>
          <span
            className="idea-chart-tag idea-chart-tag--p3 idea-rise"
            style={delay(1520)}
          >
            permit
          </span>
          <span
            className="idea-chart-tag idea-chart-tag--flat idea-rise"
            style={delay(1100)}
          >
            with a daily fleet
          </span>
        </div>
      </div>
    </div>
  );
}

const FIVE_NAMES = [
  "MEETING ROOM",
  "Meeting Rm.",
  "meeting room",
  "Mtg. Room",
  "MEETING ROOM 02"
];

/** One room, five spellings. The ink bar down the left edge is the defect
    marker — the same device the entropy grid uses for a drifted tick. */
function FiveNamesPlate() {
  return (
    <div className="idea-names">
      <p className="idea-label idea-label--paper idea-rise" style={delay(200)}>
        One room · five names
      </p>
      <div className="idea-names-grid">
        <div className="idea-names-bar idea-rise" style={delay(280)} />
        <div className="idea-names-list">
          {FIVE_NAMES.map((name, i) => (
            <p
              key={name}
              className="idea-name idea-rise"
              style={delay(360 + i * 110)}
            >
              {name}
            </p>
          ))}
        </div>
      </div>
      <p className="idea-names-foot idea-rise" style={delay(1000)}>
        revit flags none of these
      </p>
    </div>
  );
}

const WARNING_TEXT = [
  "Highlighted walls overlap. One of them may be ignored…",
  "Room Tag is outside of its Room.",
  "Elements have duplicate 'Mark' values.",
  "There are identical instances in the same place.",
  "Highlighted floors overlap.",
  "Room separation lines overlap.",
  "Wall is slightly off axis and may cause inaccuracies.",
  "Area is not in a properly enclosed region.",
  "Highlighted ceilings overlap.",
  "Curtain panels are slightly off axis.",
  "Highlighted elements are joined but do not intersect.",
  "Multiple Rooms are in the same enclosed region.",
  "Line is slightly off axis and may cause inaccuracies.",
  "Highlighted grids overlap in this view."
];

/**
 * One warning dialog, drawn rather than screenshot.
 *
 * The deck tiles a Revit capture that the repo does not carry; a drawing
 * needs no asset, scales with the sheet and stays inside the three colours.
 * Sizes are all em-relative so one font-size per tile scales the whole thing.
 */
function WarningDialog({ rows }: { rows: number }) {
  return (
    <div className="idea-dialog">
      <div className="idea-dialog-bar">
        <span>Warnings</span>
        <span>×</span>
      </div>
      <div className="idea-dialog-body">
        {WARNING_TEXT.slice(0, rows).map((text) => (
          <div key={text} className="idea-dialog-row">
            <span className="idea-dialog-mark">!</span>
            <span className="idea-dialog-text">{text}</span>
          </div>
        ))}
      </div>
      <div className="idea-dialog-foot">
        <span className="idea-dialog-btn">Delete Checked</span>
        <span className="idea-dialog-btn">OK</span>
      </div>
    </div>
  );
}

/*
 * Sixteen dialogs tiled past all four edges, at the deck's own coordinates
 * converted off the 1920×1080 box into percentages so the wall holds its
 * composition at any width.
 */
const WALL_TILES: Array<{
  left: number;
  top: number;
  width: number;
  tilt: number;
  rows: number;
}> = [
  { left: -3.6, top: -5.6, width: 28.1, tilt: -3, rows: 11 },
  { left: 19.8, top: -10.2, width: 34.4, tilt: 2, rows: 13 },
  { left: 48.4, top: -3.7, width: 26, tilt: -2, rows: 10 },
  { left: 67.7, top: -8.3, width: 37.5, tilt: 3, rows: 13 },
  { left: -7.8, top: 27.8, width: 37.5, tilt: 2, rows: 12 },
  { left: 21.9, top: 22.2, width: 28.1, tilt: -4, rows: 10 },
  { left: 43.8, top: 33.3, width: 33.3, tilt: 1, rows: 12 },
  { left: 70.8, top: 26.9, width: 30.2, tilt: -3, rows: 11 },
  { left: -3.1, top: 61.9, width: 32.3, tilt: -1, rows: 12 },
  { left: 23.4, top: 63.8, width: 37.5, tilt: 3, rows: 13 },
  { left: 52.6, top: 59.1, width: 28.1, tilt: -2, rows: 10 },
  { left: 74.5, top: 66.5, width: 34.4, tilt: 2, rows: 12 },
  { left: 9.4, top: 43.5, width: 21.9, tilt: 5, rows: 9 },
  { left: 61.5, top: 1.9, width: 19.8, tilt: -5, rows: 9 },
  { left: 39.6, top: -12, width: 17.7, tilt: 4, rows: 9 },
  { left: 3.1, top: 11.1, width: 15.6, tilt: -6, rows: 9 },
  { left: -6, top: 86, width: 24.5, tilt: -2, rows: 10 },
  { left: 14, top: 90, width: 29, tilt: 3, rows: 10 },
  { left: 40, top: 86, width: 26, tilt: -3, rows: 10 },
  { left: 63, top: 90, width: 31, tilt: 2, rows: 10 },
  { left: 86, top: 84, width: 27, tilt: -2, rows: 10 }
];

/**
 * Exhibit A — the dialog wall, run to the sheet's edge.
 *
 * Detection is solved, and this is what solved looks like. The wall is kept
 * pale rather than faint: pushed much further down it stops reading as
 * dialogs and becomes texture, which loses the joke.
 */
function DialogWall() {
  return (
    <div className="idea-wall">
      <div className="idea-wall-tiles">
        {WALL_TILES.map((tile, i) => (
          <div
            key={i}
            className="idea-wall-tile idea-rise"
            style={
              {
                left: `${tile.left}%`,
                top: `${tile.top}%`,
                width: `${tile.width}%`,
                transform: `rotate(${tile.tilt}deg)`,
                fontSize: `clamp(5px, ${(tile.width / 38).toFixed(2)}vw, 14px)`,
                "--d": `${i * 55}ms`
              } as CSSProperties
            }
          >
            <WarningDialog rows={tile.rows} />
          </div>
        ))}
      </div>
      <div className="idea-wall-scrim" />
      <div className="idea-wall-copy">
        <div className="idea-wall-head">
          <p
            className="idea-label idea-label--paper idea-rise"
            style={delay(0)}
          >
            Detection is solved
          </p>
        </div>
        <div className="idea-wall-statement">
          <h1 className="idea-rise" style={delay(200)}>
            Nobody has ever reached the bottom of this dialog.
          </h1>
          <p
            className="idea-label idea-label--paper idea-rise"
            style={delay(420)}
          >
            one dialog · open on every project in this room
          </p>
        </div>
      </div>
    </div>
  );
}

/** The 270° both rings share: detect, then hand over a list. */
const RING_SHARED = "M130 20 A 110 110 0 1 1 20 130";
/** The last quarter — a dead end on one ring, a closed return on the other. */
const RING_LAST = "M20 130 A 110 110 0 0 1 130 20";

/**
 * Two rings, open and closed. Every checker draws three quarters of the loop
 * and stops; the same loop with the last quarter built is the whole product.
 * Set side by side rather than stacked — the comparison is the point.
 */
function ThesisPlate() {
  return (
    <div className="idea-rings">
      <div className="idea-ring-row">
        <svg
          viewBox="0 0 260 260"
          fill="none"
          aria-hidden
          className="idea-ring-svg idea-rise"
          style={delay(240)}
        >
          <path
            d={RING_SHARED}
            stroke="rgba(235, 232, 225, 0.4)"
            strokeWidth={5}
            strokeLinecap="round"
            pathLength={1}
            className="idea-draw idea-draw-slow"
            style={delay(300)}
          />
          <path
            d={RING_LAST}
            stroke="rgba(22, 24, 28, 0.5)"
            strokeWidth={4}
            strokeDasharray="3 14"
            strokeLinecap="round"
            className="idea-rise"
            style={delay(1100)}
          />
          {/* The dead end, in ink: the return that never runs. */}
          <circle
            cx={20}
            cy={130}
            r={11}
            fill={INK}
            className="idea-pop"
            style={delay(1300)}
          />
        </svg>
        <div className="idea-ring-caption idea-rise" style={delay(400)}>
          <p className="idea-ring-name">EVERY CHECKER</p>
          <p className="idea-ring-body">
            stops at the list —<br />
            the return never runs
          </p>
        </div>
      </div>

      <div className="idea-ring-row">
        <svg
          viewBox="0 0 260 260"
          fill="none"
          aria-hidden
          className="idea-ring-svg idea-rise"
          style={delay(520)}
        >
          <path
            d={RING_SHARED}
            stroke="rgba(235, 232, 225, 0.4)"
            strokeWidth={5}
            strokeLinecap="round"
            pathLength={1}
            className="idea-draw idea-draw-slow"
            style={delay(580)}
          />
          <path
            d={RING_LAST}
            stroke="#ebe8e1"
            strokeWidth={9}
            strokeLinecap="round"
            pathLength={1}
            className="idea-draw"
            style={delay(1500)}
          />
          <path
            d="M121 12 L137 20 L121 28 Z"
            fill="#ebe8e1"
            className="idea-pop"
            style={delay(2100)}
          />
        </svg>
        <div className="idea-ring-caption idea-rise" style={delay(680)}>
          <p className="idea-ring-name idea-ring-name--hero">ORIGO</p>
          <p className="idea-ring-body">
            the same loop, with
            <br />
            the last quarter built
          </p>
        </div>
      </div>
    </div>
  );
}

/*
 * The morning batch: eight proposals, six approved and two sent back. The
 * ink outlines are the same vocabulary as `MorningPlate`'s rejected row.
 */
const BATCH = [67.6, 54.7, 75.7, 58.1, 70.3, 50, 73, 61.5];
const SENT_BACK = new Set([3, 6]);

/** Standards accumulating: three written, the fourth still being written. */
const BAND_RULES = ["100%", "84%", "95%", "41%"];

/**
 * Value — the composition is the argument. A and B are the surface work; C
 * is the ground they both feed, so it bleeds edge to edge and outweighs
 * them both rather than sitting beside them as a third equal card.
 */
function ValueStage() {
  return (
    <div className="idea-value">
      <div className="idea-value-body">
        <div className="idea-value-top">
          <div className="idea-batch idea-rise" style={delay(200)}>
            <p className="idea-label">The morning batch</p>
            {BATCH.map((width, i) => {
              const back = SENT_BACK.has(i);
              return (
                <div
                  key={i}
                  className="idea-batch-row idea-rise"
                  style={delay(280 + i * 70)}
                >
                  <span
                    className={
                      back
                        ? "idea-batch-box idea-batch-box--back"
                        : "idea-batch-box"
                    }
                  >
                    {back ? "×" : null}
                  </span>
                  <span
                    className={
                      back
                        ? "idea-batch-rule idea-batch-rule--back"
                        : "idea-batch-rule"
                    }
                    style={{ width: `${width}%` }}
                  />
                </div>
              );
            })}
            <p className="idea-label">8 proposed · ~5 min</p>
          </div>

          <p className="idea-value-arrow idea-rise" style={delay(700)}>
            →
          </p>

          <div className="idea-artifact-col idea-rise" style={delay(780)}>
            <div className="idea-artifact-head">
              <span className="idea-artifact-key">A</span>
              <h2 className="idea-card-title">Pre-drafted fixes</h2>
            </div>
            <div className="idea-artifact">
              <p className="idea-label">Element 4 829 173 · type name</p>
              <p className="idea-data idea-artifact-strike">“Insultation”</p>
              <p className="idea-artifact-row">
                <span className="idea-artifact-key">→</span>
                <span className="idea-data font-bold">“Insulation”</span>
              </p>
            </div>
            <p className="idea-artifact-note">
              Approved inside Revit, in place. Nothing to retype.
            </p>
          </div>

          <div className="idea-artifact-col idea-rise" style={delay(900)}>
            <div className="idea-artifact-head">
              <span className="idea-artifact-key">B</span>
              <h2 className="idea-card-title">Pre-done investigation</h2>
            </div>
            <div className="idea-artifact">
              <p className="idea-label">Fire rating · 2 notations</p>
              <p className="idea-artifact-row">
                <span className="idea-data">“2 HR”</span>
                <span className="idea-label">vs</span>
                <span className="idea-data">“120 min”</span>
              </p>
              <p className="idea-artifact-row">
                <span className="idea-artifact-key">?</span>
                <span className="idea-label">
                  same duration — which is house style?
                </span>
              </p>
            </div>
            <p className="idea-artifact-note">
              Located, dissected, recommended. <b>You make the call.</b>
            </p>
          </div>
        </div>

        <div className="idea-value-drops idea-rise" style={delay(1050)}>
          <div />
          <div />
          <p className="idea-drop">↓ every approval</p>
          <p className="idea-drop">↓ every reason for no</p>
        </div>
      </div>

      <div
        className="idea-value-band idea-bleed-x idea-rise"
        style={delay(1150)}
      >
        <div>
          <p className="idea-band-label">C · the layer under both</p>
          <h2 className="idea-band-title">Standards that write themselves</h2>
        </div>
        <div className="idea-band-rules">
          {BAND_RULES.map((width, i) => (
            <span
              key={width}
              className="idea-band-rule idea-write"
              style={{ width, "--d": `${1300 + i * 130}ms` } as CSSProperties}
            />
          ))}
          <p className="idea-band-label">one reason at a time</p>
        </div>
        <div>
          <p className="idea-band-body">
            An executable record of what <em>this firm</em> actually means —
            assembled as a byproduct of the five minutes.
          </p>
          <p className="idea-band-label">
            most firms’ standards live in a PDF nobody checks
          </p>
        </div>
      </div>
    </div>
  );
}

/** The first real run's copy column: one number doing the work. */
function RunCopy() {
  return (
    <>
      <div className="idea-run-figure idea-rise" style={delay(160)}>
        <span className="idea-run-count">111</span>
        <span className="idea-run-of">
          instances
          <br />
          of
        </span>
      </div>
      <p className="idea-run-word idea-rise" style={delay(320)}>
        “Insultation”
      </p>
      <p className="idea-note idea-rise" style={delay(460)}>
        Also <span className="font-mono">“Terrazo”</span> and a doubled inch
        mark. All well-formed strings — Revit’s spell check never reads
        parameter values, so none of these were ever going to surface.
      </p>
    </>
  );
}

const RUN_STATS: Array<[string, string]> = [
  ["Cost per run", "~$6 → cents"],
  ["Review time", "~5 min / day"],
  ["Findings, first run", "7"]
];

/** What the run cost: the index the fleet actually reads, and the bill. */
function RunPlate() {
  return (
    <div className="idea-run">
      <div>
        <p
          className="idea-label idea-label--paper idea-rise"
          style={delay(200)}
        >
          Index size — geometry never fetched
        </p>
        <div className="idea-run-bars" style={{ marginTop: "0.875rem" }}>
          <div className="idea-run-bar-row">
            <span
              className="idea-run-bar idea-run-bar--before idea-write"
              style={delay(320)}
            />
            <span className="idea-data">863 MB</span>
          </div>
          <div className="idea-run-bar-row">
            <span>
              {/* 122.5 of 863 — the ratio is the claim, so it is drawn, not
                  described. */}
              <span
                className="idea-run-bar idea-run-bar--after idea-write"
                style={
                  {
                    display: "block",
                    width: "14.2%",
                    "--d": "520ms"
                  } as CSSProperties
                }
              />
            </span>
            <span className="idea-data idea-run-value">122.5 MB</span>
          </div>
        </div>
      </div>

      <div className="idea-run-stats">
        {RUN_STATS.map(([label, value], i) => (
          <div
            key={label}
            className="idea-run-stat idea-rise"
            style={delay(700 + i * 120)}
          >
            <span>{label}</span>
            <span className="idea-run-value">{value}</span>
          </div>
        ))}
      </div>

      <p className="idea-run-foot idea-rise" style={delay(1100)}>
        candidate selection is deterministic SQL over value-distribution shape —
        no model decides what’s worth looking at
      </p>
    </div>
  );
}

const CHANGES: Array<[string, string]> = [
  [
    "Hundreds of untriaged warnings, no owner",
    "A short severity-ordered batch, daily"
  ],
  [
    "Cleanup crunch before every milestone",
    "Issue count trends toward zero, continuously"
  ],
  [
    "Standards live in a PDF nobody checks",
    "Standards are markdown the fleet enforces"
  ],
  ["Semantic drift invisible until export", "Caught the day it appears"],
  [
    "Every issue costs find + diagnose + fix",
    "Find and diagnose are already done"
  ]
];

/**
 * The problem slide's chart, reprised with the weight moved: the sawtooth
 * drops back and the flat line becomes the hero. Same path data on purpose.
 * The legend sits beneath the chart rather than on the curves — the flat line
 * runs low enough to strike through anything labelled near the baseline.
 */
function ChangeStage() {
  return (
    <div className="idea-change">
      <div className="idea-chart idea-chart--band idea-rise" style={delay(200)}>
        <EntropyChart hero="flat" stretch />
      </div>
      <div className="idea-legend idea-rise" style={delay(420)}>
        <span className="idea-legend-item">
          <span className="idea-legend-swatch" />
          today
        </span>
        <span className="idea-legend-item">
          <span className="idea-legend-swatch idea-legend-swatch--fleet" />
          with a daily fleet
        </span>
      </div>

      <div className="idea-change-rows">
        <div
          className="idea-change-row idea-change-row--head idea-rise"
          style={delay(520)}
        >
          <span className="idea-change-today">Today</span>
          <span />
          <span className="idea-label--blue">With the fleet</span>
        </div>
        {CHANGES.map(([today, fleet], i) => (
          <div
            key={today}
            className="idea-change-row idea-rise"
            style={delay(600 + i * 90)}
          >
            <span className="idea-change-today">{today}</span>
            <span className="idea-change-arrow">→</span>
            <span className="idea-change-fleet">{fleet}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type Rung = {
  tag: string;
  status?: string;
  title: string;
  sub: string;
  /** Bar height as a share of the ladder — the rungs rise left to right. */
  h: string;
  fill: string;
  tagColor: string;
  built: boolean;
};

const LADDER: Rung[] = [
  {
    tag: "v0",
    status: "built · runs today",
    title: "Parameter update CRs",
    sub: "Misspellings, notation drift, unit coherence",
    h: "26%",
    fill: "#2323e6",
    tagColor: "#ebe8e1",
    built: true
  },
  {
    tag: "v0.5",
    title: "Same write scope",
    sub: "Compliance triage · room naming · exceptions log",
    h: "40%",
    fill: "rgba(35, 35, 230, 0.42)",
    tagColor: "#ebe8e1",
    built: false
  },
  {
    tag: "v1",
    title: "+ element delete CRs",
    sub: "Nomenclature · duplicate rooms · duplicate marks",
    h: "54%",
    fill: "#e1ded5",
    tagColor: "#6c7077",
    built: false
  },
  {
    tag: "v1.5",
    title: "+ geometry read, warning list",
    sub: "Identical instances · overlaps · off-axis lines",
    h: "70%",
    fill: "#e1ded5",
    tagColor: "#6c7077",
    built: false
  },
  {
    tag: "v2",
    title: "+ geometry write",
    sub: "Off-axis snap · simple element creation",
    h: "88%",
    fill: "#e1ded5",
    tagColor: "#6c7077",
    built: false
  }
];

/** What gates Origo is write scope, not detection ideas — so the ladder is
    drawn in write scope and the rungs rise as the scope widens. */
function LadderStage() {
  return (
    <>
      <div className="idea-ladder">
        {LADDER.map((rung, i) => (
          <div
            key={rung.tag}
            className={rung.built ? "idea-rung" : "idea-rung idea-rung--future"}
          >
            <div
              className="idea-rung-copy idea-rise"
              style={delay(300 + i * 110)}
            >
              {rung.status && <p className="idea-rung-status">{rung.status}</p>}
              <p className="idea-rung-title">{rung.title}</p>
              <p className="idea-rung-sub">{rung.sub}</p>
            </div>
            <div
              className="idea-rung-bar idea-grow"
              style={
                {
                  ...height(rung.h),
                  backgroundColor: rung.fill,
                  "--d": `${200 + i * 110}ms`
                } as CSSProperties
              }
            >
              <span
                className="idea-rung-tag"
                style={{
                  color: rung.tagColor,
                  fontWeight: rung.built ? 700 : 400
                }}
              >
                {rung.tag}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="idea-foot-note idea-rise" style={delay(900)}>
        Every parked rung has a written task spec in{" "}
        <span className="idea-label--blue">fleet/tasks/</span> — the roadmap is
        detection depth, not new plumbing.
      </p>
    </>
  );
}

const INVARIANTS: Array<[string, string]> = [
  ["Human approval is the only write path", "No autonomous writes. Ever."],
  [
    "No change request without a one-read rationale",
    "If it needs a second paragraph, the fix isn’t confident enough."
  ],
  [
    "A finding is never filed twice",
    "Stable fingerprint, deduped against open issues."
  ],
  [
    "The cap is a feature, not a limit",
    "A reviewer trained to bulk-approve would kill the product."
  ]
];

/** Four invariants as equal rows. The fourth is the one the product rests
    on, so it takes the heavy rule and the others take a hairline. */
function TrustCopy() {
  return (
    <>
      <Statement>Nothing touches the model but you.</Statement>
      <div className="idea-invariants">
        {INVARIANTS.map(([title, body], i) => (
          <div
            key={title}
            className={
              i === 3
                ? "idea-invariant idea-invariant--key idea-rise"
                : "idea-invariant idea-rise"
            }
            style={delay(420 + i * 110)}
          >
            <span className="idea-invariant-n">
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="idea-invariant-t">{title}</p>
            <p className="idea-invariant-b">{body}</p>
          </div>
        ))}
      </div>
    </>
  );
}

const PROBLEMS: Array<[string, string]> = [
  [
    "Detection without resolution.",
    "Hundreds of untriaged warnings, no owner."
  ],
  ["Semantic blindness.", "A regex can’t tell a convention from a violation."],
  ["Uneconomic for humans.", "30 seconds a fix. Weeks in aggregate."]
];

/** The problem stated three ways, because one sentence reads as an opinion
    and three numbered claims read as a diagnosis. */
function ProblemCopy() {
  return (
    <>
      <Statement>BIM rot is continuous. Cleanup is episodic.</Statement>
      <div className="idea-points">
        {PROBLEMS.map(([lead, rest], i) => (
          <div
            key={lead}
            className="idea-point idea-rise"
            style={delay(420 + i * 120)}
          >
            <span className="idea-point-n">
              {String(i + 1).padStart(2, "0")}
            </span>
            <p>
              <b>{lead}</b> {rest}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Appendix — why now. Two arcs facing each other: the return path opening and
 * the judgment layer arriving. Neither half is a loop on its own, and they
 * only just met.
 */
function WhyNowPlate() {
  return (
    <div className="idea-why">
      <div className="idea-why-art">
        <svg
          viewBox="0 0 600 600"
          fill="none"
          aria-hidden
          className="idea-why-svg"
        >
          <path
            d="M339.5 114.2 A190 190 0 0 1 339.5 485.8"
            stroke="#ebe8e1"
            strokeWidth={5}
            strokeLinecap="round"
            pathLength={1}
            className="idea-draw idea-draw-slow"
            style={delay(300)}
          />
          <path
            d="M260.5 485.8 A190 190 0 0 1 260.5 114.2"
            stroke="#ebe8e1"
            strokeWidth={5}
            strokeLinecap="round"
            pathLength={1}
            className="idea-draw idea-draw-slow"
            style={delay(700)}
          />
          {/* The two open ends, in ink: what neither half could close alone. */}
          <circle
            cx={300}
            cy={110}
            r={9}
            fill={INK}
            className="idea-pop"
            style={delay(1500)}
          />
          <circle
            cx={300}
            cy={490}
            r={9}
            fill={INK}
            className="idea-pop"
            style={delay(1600)}
          />
        </svg>
        <p className="idea-why-center idea-rise" style={delay(900)}>
          two halves
          <br />
          one loop
        </p>
        <div
          className="idea-why-tag idea-why-tag--return idea-rise"
          style={delay(1100)}
        >
          <b>RETURN PATH</b>
          <span>
            speckle writes
            <br />
            back into revit
          </span>
        </div>
        <div
          className="idea-why-tag idea-why-tag--judgment idea-rise"
          style={delay(1200)}
        >
          <b>JUDGMENT</b>
          <span>
            the fleet decides
            <br />
            what a value means
          </span>
        </div>
      </div>
    </div>
  );
}

const OBJECTION: Array<[string, string, string]> = [
  ["Trigger", "Someone remembers to export", "Webhook, on every publish"],
  [
    "Scope",
    "The categories you thought to include",
    "Every object’s writable parameters"
  ],
  [
    "Knows what’s fixable",
    "No — proposes edits Revit will refuse",
    "Non-editable parameters are never indexed"
  ],
  [
    "Output",
    "Text you retype into the model",
    "A change request accepted in place"
  ]
];

/** Appendix — the obvious objection, taken head on. An LLL reading a pasted
    schedule spots the misspelling perfectly well; that is the easy half. */
function ObjectionStage() {
  return (
    <>
      <div className="idea-objection">
        <div
          className="idea-objection-row idea-objection-row--head idea-rise"
          style={delay(200)}
        >
          <span />
          <span>Schedule → chat window</span>
          <span className="idea-objection-fleet">The fleet</span>
        </div>
        {OBJECTION.map(([key, chat, fleet], i) => (
          <div
            key={key}
            className="idea-objection-row idea-rise"
            style={delay(280 + i * 110)}
          >
            <span className="idea-objection-key">{key}</span>
            <span className="idea-objection-chat">{chat}</span>
            <span>{fleet}</span>
          </div>
        ))}
      </div>
      <p className="idea-foot-note idea-rise" style={delay(800)}>
        It spots “Insultation” perfectly well.{" "}
        <span className="idea-label--blue">
          The additionality is the pipeline and the return path — both built.
        </span>{" "}
        Detection depth is the roadmap.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The deck.                                                           */
/* ------------------------------------------------------------------ */

type Slide = {
  eyebrow: string;
  /** The serif display line. On a `full` slide it sets across the stage. */
  statement?: string;
  /** A mono note opposite the eyebrow, `full` slides only. */
  label?: ReactNode;
  note?: ReactNode;
  /** Replaces the statement + note body when a copy column needs its own
      composition — a numbered diagnosis, one enormous number, four rows. */
  copy?: () => ReactNode;
  /** `spread` only: the drawing beside the copy. */
  plate?: () => ReactNode;
  /** `full` and `bleed` only: the composition owns the whole stage. */
  render?: () => ReactNode;
  layout?: "spread" | "full" | "bleed";
  plateSurface?: "blue" | "paper";
  /** The loop mark, set above the eyebrow in the copy column. */
  mark?: boolean;
  cta?: boolean;
};

/** The statement, animated word by word unless motion is turned down. */
function Statement({ children }: { children: string }) {
  const reduced = usePrefersReducedMotion();

  if (reduced) return <h1 className="idea-statement">{children}</h1>;

  return (
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
      {children}
    </TextAnimate>
  );
}

/*
 * The narrative order of the pitch deck, with the repo's own plates kept
 * where they beat the deck's: the relay on one clock instead of the deck's
 * architecture ring, the existing team opener, the existing close.
 *
 * Every claim is lifted from product-overview.md and the deck, cut to pitch
 * length. The overview argues; the deck states.
 */
const SLIDES: Slide[] = [
  {
    eyebrow: "Origo — the team",
    statement: "We are team Origo.",
    note: "We have seen how bad models can get, and how much time is wasted fixing them manually.",
    plate: TeamPlate,
    mark: true
  },
  {
    eyebrow: "01 — The problem",
    copy: ProblemCopy,
    plate: EntropyChartPlate,
    plateSurface: "paper"
  },
  {
    eyebrow: "02 — What Revit cannot see",
    statement: "One room. Five names. No warning.",
    note: "Every one of them is a well-formed string, so nothing is technically broken and nothing gets flagged. A rule can't tell a house convention from a violation — and this is most of what is actually wrong in a model.",
    plate: FiveNamesPlate
  },
  {
    eyebrow: "Exhibit A",
    statement: "Nobody has ever reached the bottom of this dialog.",
    layout: "bleed",
    render: DialogWall
  },
  {
    eyebrow: "03 — The thesis",
    statement: "Origo closes the loop.",
    note: "Every checker at this hackathon detects, hands over a list, and stops exactly there. Nobody ships the last quarter — the part where the fix lands back in the model.",
    plate: ThesisPlate
  },
  {
    eyebrow: "04 — The architecture",
    statement: "Publish the model. The fleet does the rest.",
    note: "A publish lands in Speckle and wakes Origo. Scouts fan out over the version, file what they find as issues with the fixes pre-drafted, and you review them in Origo. Only what you approve flows back — the next publish comes back fixed.",
    plate: ArchitecturePlate
  },
  {
    eyebrow: "05 — First real run",
    copy: RunCopy,
    plate: RunPlate
  },
  {
    eyebrow: "06 — Value",
    statement: "Three forms of value. The third compounds.",
    layout: "full",
    render: ValueStage
  },
  {
    eyebrow: "07 — The system",
    label: (
      <p className="idea-system-legend">
        <span className="idea-system-built">● built</span>
        <span className="idea-system-designed">○ designed</span>
      </p>
    ),
    layout: "full",
    render: SystemPlate
  },
  {
    eyebrow: "08 — What changes for the customer",
    statement: "The curve stops climbing.",
    layout: "full",
    render: ChangeStage
  },
  {
    eyebrow: "09 — Trust",
    copy: TrustCopy,
    plate: TrustPlate
  },
  {
    eyebrow: "Origo",
    statement: "Daily maintenance. Not cleanup sprints.",
    note: "Small, reviewable, pre-drafted, human-approved.",
    plate: ClosePlate,
    cta: true
  },
  {
    eyebrow: "Appendix — Why now",
    statement: "Two halves of the loop just met.",
    note: "Speckle can now carry parameter updates back into Revit as change requests; without that return path, the ceiling on any checker is a report. And the judgment left over — intentional duplicate or mistake, “4 HR” or four hours — is exactly what rule engines cannot do.",
    plate: WhyNowPlate
  },
  {
    eyebrow: "Appendix — Scope ladder",
    statement: "What Origo can write, and when.",
    layout: "full",
    render: LadderStage
  },
  {
    eyebrow: "Appendix — The obvious objection",
    statement: "“Just export a schedule and paste it into an LLM.”",
    layout: "full",
    render: ObjectionStage
  },
  {
    eyebrow: "Backup — the recording",
    statement: "The pitch, on tape.",
    note: "A recording of this presentation, kept here in case the live run can't happen.",
    plate: RecordingPlate
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
  const layout = slide.layout ?? "spread";
  const Plate = slide.plate;
  const Render = slide.render;

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
            layout !== "spread" && `idea-slide--${layout}`,
            leaving && "idea-slide-leaving"
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {/* `bleed` owns everything including its own chrome: the art runs
              past where the eyebrow would sit. */}
          {layout === "bleed" && Render && <Render />}

          {layout === "full" && (
            <>
              <div className="idea-full-head">
                <p className="idea-eyebrow idea-rise" style={delay(0)}>
                  {slide.eyebrow}
                </p>
                {slide.label && (
                  <div className="idea-rise" style={delay(80)}>
                    {slide.label}
                  </div>
                )}
              </div>
              {slide.statement && (
                <h1 className="idea-headline idea-rise" style={delay(120)}>
                  {slide.statement}
                </h1>
              )}
              {Render && <Render />}
            </>
          )}

          {layout === "spread" && (
            <>
              <div className="idea-copy">
                {slide.mark && <LoopMark size="2.5rem" weight={6} />}

                <p className="idea-eyebrow idea-rise" style={delay(0)}>
                  {slide.eyebrow}
                </p>

                {slide.copy ? (
                  slide.copy()
                ) : (
                  <>
                    {slide.statement && (
                      <Statement>{slide.statement}</Statement>
                    )}
                    {slide.note && (
                      <p className="idea-note idea-rise" style={delay(420)}>
                        {slide.note}
                      </p>
                    )}
                  </>
                )}

                {slide.cta && (
                  <div className="idea-rise" style={delay(640)}>
                    <Link to="/inbox" className="origo-cta">
                      Open Inbox
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                )}
              </div>

              {Plate && (
                <div
                  className={[
                    "idea-plate",
                    slide.plateSurface === "paper" && "idea-plate--paper",
                    "idea-rise"
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={delay(120)}
                >
                  <Plate />
                </div>
              )}
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
              aria-label={`Slide ${i + 1}: ${entry.statement ?? entry.eyebrow}`}
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
