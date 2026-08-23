// Phase 1 spike (docs/large-model-ingestion-plan.md): measure the wire cost of
// a selective, geometry-skipping walk of a Speckle version versus the full
// `/objects/{project}/{root}` stream the loader uses today.
//
// The walk: fetch the root via `/single`, then breadth-first over
// `{speckle_type: "reference"}` nodes using `POST /api/getobjects` in batches,
// never descending into `displayValue` (per-element geometry) and never
// entering the collection named `definitionGeometry` (instance-definition
// meshes — the only other place geometry hangs in a Revit v3 commit).
//
// Usage: node scripts/spike-selective-walk.mjs <projectId> <versionId>
// Reads SPECKLE_TOKEN from scout/.env.

import { readFileSync } from "node:fs";

const SERVER = "https://app.speckle.systems";
const [projectId, versionId] = process.argv.slice(2);
if (!projectId || !versionId) {
  console.error(
    "usage: node scripts/spike-selective-walk.mjs <projectId> <versionId>"
  );
  process.exit(1);
}
const token = readFileSync(new URL("../.env", import.meta.url), "utf8").match(
  /SPECKLE_TOKEN="?([^"\r\n]+)/
)[1];

const BATCH = 500;
const SKIP_KEYS = new Set(["displayValue", "__closure"]);
const GEOMETRY_COLLECTIONS = new Set(["definitionGeometry"]);

const gql = async (query, variables) => {
  const r = await fetch(`${SERVER}/graphql`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });
  return (await r.json()).data;
};

const info = await gql(
  `query ($projectId: String!, $versionId: String!) {
    project(id: $projectId) {
      version(id: $versionId) {
        referencedObject totalChildrenCount packfileSize
        model { name }
      }
    }
  }`,
  { projectId, versionId }
);
const version = info.project.version;
const root = version.referencedObject;

function collectRefs(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, out);
    return;
  }
  if (node === null || typeof node !== "object") return;
  if (node.speckle_type === "reference" && node.referencedId) {
    out.push(node.referencedId);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (SKIP_KEYS.has(key)) continue;
    collectRefs(value, out);
  }
}

const seen = new Set([root]);
const queue = [];
let bytes = 0;
let requests = 0;
const counts = new Map();
const sizes = new Map();
const tally = (type, lineBytes) => {
  const key = (type ?? "?").split(/[.:]/).pop();
  counts.set(key, (counts.get(key) ?? 0) + 1);
  sizes.set(key, (sizes.get(key) ?? 0) + lineBytes);
};
const enqueue = (obj) => {
  if (
    obj.speckle_type?.includes("Collection") &&
    GEOMETRY_COLLECTIONS.has(obj.name)
  )
    return;
  const refs = [];
  collectRefs(obj, refs);
  for (const id of refs) {
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(id);
  }
};

const started = Date.now();
{
  const r = await fetch(`${SERVER}/objects/${projectId}/${root}/single`, {
    headers: { authorization: `Bearer ${token}` }
  });
  const text = await r.text();
  bytes += text.length;
  const rootObj = JSON.parse(text);
  tally(rootObj.speckle_type, text.length);
  enqueue(rootObj);
}

while (queue.length > 0) {
  const ids = queue.splice(0, BATCH);
  const r = await fetch(`${SERVER}/api/getobjects/${projectId}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "text/plain"
    },
    body: JSON.stringify({ objects: JSON.stringify(ids) })
  });
  if (!r.ok) throw new Error(`getobjects failed: ${r.status}`);
  requests++;
  const text = await r.text();
  bytes += text.length;
  for (const line of text.split("\n")) {
    if (!line) continue;
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    const obj = JSON.parse(line.slice(tab + 1));
    tally(obj.speckle_type, line.length);
    enqueue(obj);
  }
  console.error(
    `...${seen.size} seen, ${(bytes / 1e6).toFixed(1)} MB, queue ${queue.length}`
  );
}

console.log(
  JSON.stringify(
    {
      model: version.model?.name,
      versionId,
      packfileMB: +(Number(version.packfileSize) / 1e6).toFixed(1),
      totalChildrenCount: version.totalChildrenCount,
      selective: {
        requests,
        objectsFetched: [...counts.values()].reduce((a, b) => a + b, 0),
        wireMB: +(bytes / 1e6).toFixed(1),
        elapsedS: Math.round((Date.now() - started) / 1000),
        byType: Object.fromEntries(
          [...counts.entries()].map(([type, n]) => [
            type,
            { count: n, mb: +((sizes.get(type) ?? 0) / 1e6).toFixed(1) }
          ])
        )
      }
    },
    null,
    2
  )
);
