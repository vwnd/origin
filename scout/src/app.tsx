import { useMemo, useState } from "react";
import {
  Box,
  Building2,
  ChevronDown,
  CircleHelp,
  Cloud,
  Copy,
  Grid3X3,
  Layers3,
  MousePointer2,
  Rotate3D,
  Save,
  SlidersHorizontal,
  Undo2,
  Upload,
  Wind,
  X
} from "lucide-react";
import { DesignViewport } from "@/components/DesignViewport";
import {
  DEFAULT_DESIGN,
  type Alternative,
  type DesignParameters,
  type RoofType
} from "@/design/types";
import { getSampleFindings } from "@/design/assessment";

const STORAGE_KEY = "aeroframe-alternatives-v1";
const loadSaved = (): Alternative[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};

function NumberControl({
  label,
  value,
  unit,
  min,
  max,
  onChange
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="number-control">
      <span>{label}</span>
      <div>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) =>
            onChange(Math.max(min, Math.min(max, Number(e.target.value))))
          }
        />
        <em>{unit}</em>
      </div>
      <input
        aria-label={`${label} slider`}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export default function App() {
  const [design, setDesign] = useState<DesignParameters>(DEFAULT_DESIGN);
  const [saved, setSaved] = useState<Alternative[]>(loadSaved);
  const [selected, setSelected] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const update = <K extends keyof DesignParameters>(
    key: K,
    value: DesignParameters[K]
  ) => setDesign((d) => ({ ...d, [key]: value }));
  const save = () => {
    const alt: Alternative = {
      id: crypto.randomUUID(),
      name: `Option ${String.fromCharCode(65 + saved.length)}`,
      savedAt: new Date().toISOString(),
      parameters: { ...design }
    };
    const next = [...saved, alt];
    setSaved(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSelected(alt.id);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 1800);
  };
  const duplicate = () => {
    const alt: Alternative = {
      id: crypto.randomUUID(),
      name: `Option ${String.fromCharCode(65 + saved.length)}`,
      savedAt: new Date().toISOString(),
      parameters: { ...design }
    };
    const next = [...saved, alt];
    setSaved(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSelected(alt.id);
  };
  const findings = useMemo(() => getSampleFindings(design), [design]);
  return (
    <div className="studio-shell">
      <header className="topbar">
        <div className="brand-mark">
          <Wind size={18} />
        </div>
        <strong>AEROFRAME</strong>
        <span className="project-name">/ &nbsp; Coastal House Study</span>
        <div className="top-actions">
          <button className="icon-button">
            <Undo2 size={16} />
          </button>
          <span className="sync">
            <Cloud size={14} /> Saved locally
          </span>
          <button className="disabled-action" disabled>
            <Upload size={14} /> Revit sync · coming soon
          </button>
          <button className="icon-button">
            <CircleHelp size={17} />
          </button>
          <div className="avatar">JD</div>
        </div>
      </header>
      <div className="workspace">
        <aside className="left-panel">
          <div className="panel-heading">
            <span>DESIGN</span>
            <SlidersHorizontal size={15} />
          </div>
          <section>
            <h3>
              <span className="section-icon">
                <Grid3X3 size={14} />
              </span>{" "}
              Site
            </h3>
            <div className="site-card">
              <div>
                <b>Coastal site</b>
                <span>Concept datum · 0′</span>
              </div>
              <button>
                <ChevronDown size={15} />
              </button>
            </div>
            <p className="helper">
              Generic concept site. No location or hazard data connected.
            </p>
          </section>
          <section>
            <h3>
              <span className="section-icon">
                <Building2 size={14} />
              </span>{" "}
              Building mass
            </h3>
            <div className="control-grid">
              <NumberControl
                label="Width"
                value={design.width}
                min={20}
                max={100}
                unit="ft"
                onChange={(n) => update("width", n)}
              />
              <NumberControl
                label="Depth"
                value={design.depth}
                min={18}
                max={80}
                unit="ft"
                onChange={(n) => update("depth", n)}
              />
              <NumberControl
                label="Height"
                value={design.height}
                min={8}
                max={50}
                unit="ft"
                onChange={(n) => update("height", n)}
              />
              <NumberControl
                label="Orientation"
                value={design.orientation}
                min={0}
                max={359}
                unit="°"
                onChange={(n) => update("orientation", n)}
              />
              <NumberControl
                label="Floor elevation"
                value={design.elevation}
                min={0}
                max={20}
                unit="ft"
                onChange={(n) => update("elevation", n)}
              />
            </div>
          </section>
          <section>
            <h3>
              <span className="section-icon">
                <Layers3 size={14} />
              </span>{" "}
              Roof form
            </h3>
            <div className="roof-options">
              {(["Flat", "Gable", "Hip"] as RoofType[]).map((r) => (
                <button
                  key={r}
                  className={design.roof === r ? "active" : ""}
                  onClick={() => update("roof", r)}
                >
                  <span className={`roof-shape ${r.toLowerCase()}`} />
                  {r}
                </button>
              ))}
            </div>
          </section>
        </aside>
        <main className="viewport">
          <DesignViewport design={design} />
          <div className="view-title">
            <span>CONCEPT MODEL</span>
            <b>
              {design.width}′ × {design.depth}′
            </b>
          </div>
          <div className="view-tools">
            <button className="active">
              <MousePointer2 size={16} />
            </button>
            <button title="Drag to orbit">
              <Rotate3D size={16} />
            </button>
            <button title="Right-drag to pan">
              <Box size={16} />
            </button>
          </div>
          <div className="view-help">
            <span>Drag to orbit</span>
            <i /> <span>Right-drag to pan</span>
            <i /> <span>Scroll to zoom</span>
          </div>
          <div className="north">
            N<span>↑</span>
          </div>
        </main>
        <aside className="right-panel">
          <div className="assessment-head">
            <div>
              <span>ASSESSMENT</span>
              <h2>Design review</h2>
            </div>
            <span className="sample-badge">SAMPLE</span>
          </div>
          <div className="notice">
            <b>Concept guidance only</b>
            <p>
              This prototype does not calculate wind pressure, safety, code
              compliance, or structural performance.
            </p>
          </div>
          <div className="metrics">
            <div>
              <span>GROSS AREA</span>
              <b>{(design.width * design.depth).toLocaleString()} ft²</b>
            </div>
            <div>
              <span>ENCLOSED VOLUME</span>
              <b>
                {(design.width * design.depth * design.height).toLocaleString()}{" "}
                ft³
              </b>
            </div>
          </div>
          <h4 className="findings-title">
            SAMPLE REVIEW PROMPTS <span>{findings.length}</span>
          </h4>
          <div className="findings">
            {findings.map((f, i) => (
              <article key={f.title}>
                <span className={f.tone}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <b>{f.title}</b>
                  <p>{f.detail}</p>
                </div>
              </article>
            ))}
          </div>
          <button className="disabled-report" disabled>
            Engineering report · not connected
          </button>
        </aside>
      </div>
      <footer className="alternatives">
        <div className="alt-label">
          <span>ALTERNATIVES</span>
          <b>{saved.length} saved</b>
        </div>
        <div className="alt-list">
          {saved.map((a) => (
            <button
              key={a.id}
              aria-label={`Load ${a.name}`}
              className={`alt-card ${selected === a.id ? "selected" : ""}`}
              onClick={() => {
                setSelected(a.id);
                setDesign(a.parameters);
              }}
            >
              <div className="mini-building">
                <span className={a.parameters.roof.toLowerCase()} />
              </div>
              <div>
                <b>{a.name}</b>
                <span>
                  {a.parameters.roof} · +{a.parameters.elevation}′
                </span>
              </div>
            </button>
          ))}
          <button className="add-alt" onClick={save}>
            <Save size={16} />
            <span>Save current</span>
          </button>
        </div>
        <div className="alt-actions">
          <button onClick={duplicate}>
            <Copy size={15} /> Duplicate
          </button>
          <button
            className="compare-button"
            disabled={saved.length < 2}
            onClick={() => setCompare(true)}
          >
            Compare {saved.length >= 2 ? `(${saved.length})` : ""}
          </button>
        </div>
      </footer>
      {savedNotice && (
        <div className="toast">Alternative saved in this browser</div>
      )}
      {compare && (
        <div className="modal-backdrop">
          <div className="compare-modal">
            <header>
              <div>
                <span>ALTERNATIVE STUDY</span>
                <h2>Compare options</h2>
              </div>
              <button className="icon-button" onClick={() => setCompare(false)}>
                <X />
              </button>
            </header>
            <p className="modal-note">
              Parameter comparison only — no option is ranked for safety or
              performance.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Parameter</th>
                  {saved.map((a) => (
                    <th key={a.id}>{a.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    "width",
                    "depth",
                    "height",
                    "orientation",
                    "elevation",
                    "roof"
                  ] as const
                ).map((k) => (
                  <tr key={k}>
                    <td>
                      {k === "elevation"
                        ? "Floor elevation"
                        : k[0].toUpperCase() + k.slice(1)}
                    </td>
                    {saved.map((a) => (
                      <td key={a.id}>
                        {a.parameters[k]}
                        {k === "orientation"
                          ? "°"
                          : typeof a.parameters[k] === "number"
                            ? " ft"
                            : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
