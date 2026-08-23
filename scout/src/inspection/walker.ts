import { SPECKLE_SERVER_URL } from "../speckle/config";
import { toIndexedObject } from "./properties";
import type { IndexedObject } from "./properties";

/**
 * Selective, geometry-skipping traversal of a Speckle version.
 *
 * Where the streaming loader downloads the whole object graph and discards
 * ~85% of it (geometry) line by line, this walker never downloads geometry at
 * all. It breadth-firsts over `{speckle_type: "reference"}` nodes, batching
 * ids through `POST /api/getobjects`, and prunes the only two places a Revit
 * commit hangs meshes:
 *
 * - `displayValue` references on elements, and
 * - the collection named `definitionGeometry` (instance-definition meshes).
 *
 * Measured on the 863 MB ARCH-CARTER model: 122.5 MB fetched, zero meshes —
 * see `scripts/spike-selective-walk.mjs` and the plan doc.
 *
 * The walker holds no traversal state of its own. The frontier lives in the
 * InspectionAgent (durable, exceeds the 1 MiB step-result cap on large
 * models); the workflow drains it chunk by chunk, one step per chunk, and
 * hands each chunk here to be fetched, parsed, ingested, and mined for the
 * next round of references.
 */

/** Ids per `getobjects` request. Same order of magnitude the spike used. */
const REQUEST_BATCH = 500;

/** Objects per ingest RPC to the agent — matches the streaming loader. */
const INGEST_BATCH = 200;

/** Keys never descended into: geometry references and the closure table. */
const SKIP_KEYS = new Set(["displayValue", "__closure"]);

/**
 * Collections whose elements are geometry, identified by name. Revit v3
 * commits keep instance-definition meshes under exactly this collection; its
 * element count matches `instanceDefinitionProxies` 1:1.
 */
const GEOMETRY_COLLECTIONS = new Set(["definitionGeometry"]);

export type ChunkResult = {
  /** Objects fetched and parsed in this chunk. */
  fetched: number;
  /** DataObjects that made it into the index. */
  indexedObjects: number;
  indexedProperties: number;
  /** References discovered in this chunk (pre-dedupe — the agent dedupes). */
  refs: string[];
  bytes: number;
  requests: number;
};

/**
 * References reachable from one object, honouring the geometry prunes.
 * Returns nothing for a geometry collection: its elements are meshes.
 */
export function refsOf(object: Record<string, unknown>): string[] {
  if (
    typeof object.speckle_type === "string" &&
    object.speckle_type.includes("Collection") &&
    typeof object.name === "string" &&
    GEOMETRY_COLLECTIONS.has(object.name)
  ) {
    return [];
  }
  const out: string[] = [];
  collectRefs(object, out);
  return out;
}

function collectRefs(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, out);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (
    record.speckle_type === "reference" &&
    typeof record.referencedId === "string"
  ) {
    out.push(record.referencedId);
    return;
  }
  for (const [key, value] of Object.entries(record)) {
    if (SKIP_KEYS.has(key)) continue;
    collectRefs(value, out);
  }
}

/** The root object alone — carries the reference tree's entry points. */
export async function fetchRootObject(options: {
  token: string;
  projectId: string;
  rootObjectId: string;
}): Promise<{ object: Record<string, unknown>; bytes: number }> {
  const { token, projectId, rootObjectId } = options;
  const response = await fetch(
    `${SPECKLE_SERVER_URL}/objects/${projectId}/${rootObjectId}/single`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  if (!response.ok) {
    throw new Error(
      `Speckle root fetch failed: ${response.status} ${response.statusText}`
    );
  }
  const text = await response.text();
  return {
    object: JSON.parse(text) as Record<string, unknown>,
    bytes: text.length
  };
}

/**
 * Fetch one claimed chunk of ids, ingest its DataObjects, and return the
 * references it opens up. Safe to re-run wholesale: ingest is
 * INSERT OR REPLACE and the caller's enqueue is INSERT OR IGNORE.
 */
export async function walkChunk(options: {
  token: string;
  projectId: string;
  ids: string[];
  ingest: (
    batch: IndexedObject[]
  ) => Promise<{ objects: number; properties: number }>;
}): Promise<ChunkResult> {
  const { token, projectId, ids, ingest } = options;

  let fetched = 0;
  let indexedObjects = 0;
  let indexedProperties = 0;
  let bytes = 0;
  let requests = 0;
  const refs: string[] = [];
  let pending: IndexedObject[] = [];

  const flush = async () => {
    if (pending.length === 0) return;
    const stats = await ingest(pending);
    indexedObjects += stats.objects;
    indexedProperties += stats.properties;
    pending = [];
  };

  for (let i = 0; i < ids.length; i += REQUEST_BATCH) {
    const slice = ids.slice(i, i + REQUEST_BATCH);
    const response = await fetch(
      `${SPECKLE_SERVER_URL}/api/getobjects/${projectId}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "text/plain"
        },
        // The endpoint wants the id list as a JSON string inside the JSON body.
        body: JSON.stringify({ objects: JSON.stringify(slice) })
      }
    );
    if (!response.ok) {
      throw new Error(
        `Speckle getobjects failed: ${response.status} ${response.statusText}`
      );
    }
    requests++;
    const text = await response.text();
    bytes += text.length;

    for (const line of text.split("\n")) {
      if (line.length === 0) continue;
      const tab = line.indexOf("\t");
      if (tab === -1) continue;
      fetched++;
      const parsed = JSON.parse(line.slice(tab + 1)) as Record<string, unknown>;

      const indexed = toIndexedObject(parsed);
      if (indexed) {
        pending.push(indexed);
        if (pending.length >= INGEST_BATCH) await flush();
      }
      refs.push(...refsOf(parsed));
    }
  }

  await flush();
  return { fetched, indexedObjects, indexedProperties, refs, bytes, requests };
}
