import { isEditableDefinition } from "./editable";

/**
 * Flattens a Speckle DataObject into rows for the property index.
 *
 * Shaped against the real Revit payload. A published wall looks like:
 *
 *   { category, family, type, level, name, displayValue, __closure,
 *     properties: {
 *       elementId, builtInCategory, worksetName,          // scalars
 *       "Material Quantities": { "<Material>": { materialClass, area: {name,value,units} } },
 *       "Parameters": { "Instance Parameters": { "<Group>": { "<Param>": {value,name,units} } } }
 *     } }
 *
 * Two rules do most of the work:
 *
 * 1. **Parameter leaves collapse.** Revit wraps each parameter as
 *    `{value, name, internalDefinitionName, units?}`. Naive dot-path flattening
 *    would emit four rows per parameter and bury the actual value under
 *    `.name` / `.internalDefinitionName` noise, wrecking value histograms.
 *    A leaf is detected and emitted as a single row carrying value + units.
 *
 * 2. **Geometry never enters.** Excluded keys are dropped at every depth, and
 *    any nested object carrying a geometry `speckle_type` is skipped — so
 *    vertex arrays cannot reach the index even if nested somewhere unexpected.
 */

/** Dropped at any depth: geometry, visualisation, and child-reference plumbing. */
const EXCLUDED_KEYS = new Set([
  "displayValue",
  "location",
  "bbox",
  "renderMaterial",
  "transform",
  "vertices",
  "faces",
  "colors",
  "textureCoordinates",
  "vertexNormals",
  "elements",
  "__closure",
  "totalChildrenCount"
]);

const GEOMETRY_TYPE_MARKERS = [
  "Objects.Geometry.",
  "Objects.Other.",
  "Speckle.Core.Models.Instances."
];

/**
 * Whole parameter groups that are visualisation rather than data.
 *
 * Revit's `Visualization` group carries things like `Render Appearance
 * Properties`, whose value is an opaque serialized asset blob:
 *
 *   {2, 15},{22, RPC-8-E23G-6DS7-USQ4-G},{1, 0},{5, Color},{7, BBoxMin},...
 *
 * Not geometry in the vertex sense, but squarely visualisation — out of scope,
 * and useless noise in a value histogram. Matched on the group name so the
 * whole subtree is skipped wherever it appears in the parameter hierarchy.
 */
const EXCLUDED_GROUP_NAMES = new Set(["Visualization"]);

/** Guards against a pathological object producing unbounded rows. */
const MAX_ROWS_PER_OBJECT = 2000;
const MAX_DEPTH = 8;
/** Long values are geometry that slipped through, not parameters. */
const MAX_VALUE_CHARS = 300;

export type PropertyRow = {
  /** Full dotted path, e.g. `Parameters.Instance Parameters.Constraints.Top Constraint`. */
  keyPath: string;
  /** Leaf name alone, so the same parameter can be grouped across groups. */
  name: string;
  valueText: string | null;
  valueNum: number | null;
  units: string | null;
  /**
   * Revit's stable identifier for the parameter, e.g. `DOOR_FIRE_RATING`.
   * Required to address the parameter in a write-back delta, which is why a
   * row without one is never stored.
   */
  internalDefinitionName: string;
};

export type IndexedObject = {
  id: string;
  speckleType: string;
  name: string | null;
  category: string | null;
  family: string | null;
  type: string | null;
  level: string | null;
  applicationId: string | null;
  properties: PropertyRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGeometryType(speckleType: unknown): boolean {
  return (
    typeof speckleType === "string" &&
    GEOMETRY_TYPE_MARKERS.some((marker) => speckleType.startsWith(marker))
  );
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * A Revit parameter wrapper: `{ value, name, internalDefinitionName?, units? }`
 * where `value` is scalar. Returns null for anything else so the walk recurses.
 */
function asParameterLeaf(record: Record<string, unknown>): {
  value: unknown;
  units: string | null;
  internalDefinitionName: string | null;
} | null {
  if (!("value" in record) || typeof record.name !== "string") return null;
  const value = record.value;
  if (value !== null && typeof value === "object") return null;
  return {
    value,
    units: str(record.units),
    internalDefinitionName: str(record.internalDefinitionName)
  };
}

function pushValue(
  rows: PropertyRow[],
  keyPath: string,
  name: string,
  value: unknown,
  units: string | null,
  internalDefinitionName: string | null
): void {
  if (rows.length >= MAX_ROWS_PER_OBJECT) return;
  if (value === null || value === undefined || value === "") return;

  // Only parameters the parameter updater could actually write are stored, so
  // Scout never spends attention on a problem nobody can act on.
  if (!isEditableDefinition(internalDefinitionName)) return;

  const valueNum =
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const valueText = String(value).slice(0, MAX_VALUE_CHARS);

  rows.push({
    keyPath,
    name,
    valueText,
    valueNum,
    units,
    internalDefinitionName: internalDefinitionName as string
  });
}

function walk(
  node: Record<string, unknown>,
  path: string,
  rows: PropertyRow[],
  depth: number
): void {
  if (depth > MAX_DEPTH || rows.length >= MAX_ROWS_PER_OBJECT) return;

  for (const [key, value] of Object.entries(node)) {
    if (EXCLUDED_KEYS.has(key)) continue;
    if (EXCLUDED_GROUP_NAMES.has(key)) continue;
    const keyPath = path ? `${path}.${key}` : key;

    if (value === null || value === undefined) continue;

    if (typeof value !== "object") {
      // A bare scalar (elementId, worksetName, ...) carries no parameter
      // definition, so it cannot be written back — skip rather than store.
      continue;
    }

    // Arrays here are geometry lists or child references — never parameters.
    if (Array.isArray(value)) continue;
    if (!isRecord(value)) continue;

    // A detached-object pointer, not data.
    if (typeof value.referencedId === "string") continue;
    if (isGeometryType(value.speckle_type)) continue;

    const leaf = asParameterLeaf(value);
    if (leaf) {
      pushValue(
        rows,
        keyPath,
        String(value.name),
        leaf.value,
        leaf.units,
        leaf.internalDefinitionName
      );
      continue;
    }

    walk(value, keyPath, rows, depth + 1);
  }
}

/** True when a raw stream line is a DataObject we want to index. */
export const DATA_OBJECT_MARKER = "Objects.Data.DataObject";

/**
 * Convert a parsed Speckle object into an indexable row set.
 * Returns null when the object is not a DataObject.
 */
export function toIndexedObject(
  parsed: Record<string, unknown>
): IndexedObject | null {
  const speckleType = str(parsed.speckle_type);
  if (!speckleType || !speckleType.includes(DATA_OBJECT_MARKER)) return null;

  const id = str(parsed.id);
  if (!id) return null;

  const rows: PropertyRow[] = [];
  if (isRecord(parsed.properties)) {
    walk(parsed.properties, "", rows, 0);
  }

  return {
    id,
    speckleType,
    name: str(parsed.name),
    // Top-level Revit classification — pure data, and the most useful grouping
    // Claude has for describing where a problem is.
    category: str(parsed.category),
    family: str(parsed.family),
    type: str(parsed.type),
    level: str(parsed.level),
    applicationId: str(parsed.applicationId),
    properties: rows
  };
}
