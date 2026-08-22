import { SPECKLE_SERVER_URL } from "../speckle/config";
import { getVersionInfo } from "../speckle/client";
import { timingSafeEqualStrings } from "../speckle/signature";
import { createLogger, errorMessage } from "../speckle/logging";
import { runIndex, runQuery } from "./index-route";

/**
 * Token-gated diagnostics for the inspection pipeline.
 *
 * These routes read project data with the Worker's Speckle PAT, so they are
 * gated on `SCOUT_DEBUG_TOKEN` (`Authorization: Bearer …`). With no token
 * configured the whole surface is off — it fails closed, not open.
 */

const DEBUG_PREFIX = "/debug/";

export function isDebugRequest(request: Request): boolean {
  return new URL(request.url).pathname.startsWith(DEBUG_PREFIX);
}

export async function handleDebug(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const logger = createLogger(crypto.randomUUID(), { route: url.pathname });

  if (!env.SCOUT_DEBUG_TOKEN) {
    return Response.json(
      { error: "Debug routes are disabled" },
      { status: 404 }
    );
  }

  const presented = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (
    !presented ||
    !(await timingSafeEqualStrings(presented, env.SCOUT_DEBUG_TOKEN))
  ) {
    logger.warn("debug_unauthorized");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env.SPECKLE_TOKEN) {
    return Response.json(
      { error: "SPECKLE_TOKEN is not configured" },
      { status: 500 }
    );
  }

  try {
    switch (url.pathname.slice(DEBUG_PREFIX.length)) {
      case "version-info":
        return await versionInfo(url, env);
      case "object-probe":
        return await objectProbe(url, env);
      case "raw-properties":
        return await rawProperties(url, env);
      case "index":
        return await runIndex(url, env);
      case "query":
        return await runQuery(url, env);
      default:
        return Response.json({ error: "Unknown debug route" }, { status: 404 });
    }
  } catch (error) {
    logger.error("debug_failed", { error: errorMessage(error) });
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

function required(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) throw new Error(`Missing query parameter: ${name}`);
  return value;
}

/**
 * Version metadata — decides which loader can read this version and how much
 * data it will have to stream.
 */
async function versionInfo(url: URL, env: Env): Promise<Response> {
  const info = await getVersionInfo(
    env.SPECKLE_TOKEN,
    required(url, "projectId"),
    required(url, "versionId")
  );

  const packfileSize = info.version?.packfileSize;
  return Response.json({
    projectName: info.projectName,
    version: info.version,
    packfileMB: packfileSize ? Number(packfileSize) / 1_000_000 : null,
    // null => legacy packfile / PG objects, readable via GET /objects/...
    // 3    => v2 parquet bundle, needs the presigned /v2 artefacts endpoint
    storageGeneration:
      info.version?.schemaVersion == null ? "legacy" : "v2-parquet"
  });
}

/**
 * Read the first slice of the bulk objects endpoint without downloading the
 * whole version. Confirms the endpoint serves this version, that the
 * `{id}\t{json}` line format holds, and roughly what mix of types is in there.
 */
async function objectProbe(url: URL, env: Env): Promise<Response> {
  const projectId = required(url, "projectId");
  const objectId = required(url, "objectId");
  const maxBytes = Number(url.searchParams.get("maxBytes") ?? 512_000);

  const started = Date.now();
  const response = await fetch(
    `${SPECKLE_SERVER_URL}/objects/${projectId}/${objectId}`,
    {
      headers: {
        authorization: `Bearer ${env.SPECKLE_TOKEN}`,
        accept: "text/plain"
      }
    }
  );

  if (!response.ok || !response.body) {
    return Response.json(
      {
        ok: false,
        status: response.status,
        contentType: response.headers.get("content-type"),
        body: (await response.text()).slice(0, 500)
      },
      { status: 200 }
    );
  }

  // Read a bounded prefix, then abort — we only need the shape.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let bytes = 0;
  while (bytes < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    buffered += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => {});

  const lines = buffered.split("\n");
  // The last line is probably truncated mid-object.
  lines.pop();

  const typeCounts: Record<string, number> = {};
  let tabDelimited = 0;
  let firstObjectKeys: string[] = [];
  let firstDataObject: unknown = null;

  for (const line of lines) {
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    tabDelimited++;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line.slice(tab + 1));
    } catch {
      continue;
    }
    const type = String(parsed.speckle_type ?? "(none)");
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    if (firstObjectKeys.length === 0) firstObjectKeys = Object.keys(parsed);
    if (!firstDataObject && type.includes("Objects.Data.DataObject")) {
      firstDataObject = {
        speckle_type: type,
        name: parsed.name,
        applicationId: parsed.applicationId,
        topLevelKeys: Object.keys(parsed),
        // Property key shape is what the loader flattens — geometry excluded.
        propertyKeys:
          parsed.properties && typeof parsed.properties === "object"
            ? Object.keys(parsed.properties as Record<string, unknown>)
            : null,
        hasDisplayValue: "displayValue" in parsed
      };
    }
  }

  return Response.json({
    ok: true,
    status: response.status,
    contentType: response.headers.get("content-type"),
    contentLength: response.headers.get("content-length"),
    sampledBytes: bytes,
    sampledLines: lines.length,
    tabDelimitedLines: tabDelimited,
    elapsedMs: Date.now() - started,
    firstObjectKeys,
    firstDataObject,
    typeCounts: Object.fromEntries(
      Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
    )
  });
}

/**
 * Dump the raw `properties` subtree of the first DataObject in the stream.
 * Used to design the flattener against the real Revit parameter shape rather
 * than a guess. Geometry is never included.
 */
async function rawProperties(url: URL, env: Env): Promise<Response> {
  const projectId = required(url, "projectId");
  const objectId = required(url, "objectId");
  const maxChars = Number(url.searchParams.get("maxChars") ?? 6000);

  const response = await fetch(
    `${SPECKLE_SERVER_URL}/objects/${projectId}/${objectId}`,
    {
      headers: {
        authorization: `Bearer ${env.SPECKLE_TOKEN}`,
        accept: "text/plain"
      }
    }
  );
  if (!response.ok || !response.body) {
    return Response.json(
      { ok: false, status: response.status },
      { status: 200 }
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let scanned = 0;
  let found: unknown = null;

  outer: while (scanned < 4_000_000) {
    const { done, value } = await reader.read();
    if (done) break;
    scanned += value.byteLength;
    carry += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = carry.indexOf("\n")) !== -1) {
      const line = carry.slice(0, nl);
      carry = carry.slice(nl + 1);
      if (!line.includes("Objects.Data.DataObject")) continue;
      const tab = line.indexOf("\t");
      if (tab === -1) continue;
      try {
        const parsed = JSON.parse(line.slice(tab + 1)) as Record<
          string,
          unknown
        >;
        found = {
          speckle_type: parsed.speckle_type,
          name: parsed.name,
          category: parsed.category,
          family: parsed.family,
          type: parsed.type,
          level: parsed.level,
          properties: parsed.properties
        };
        break outer;
      } catch {
        continue;
      }
    }
  }
  await reader.cancel().catch(() => {});

  const json = JSON.stringify(found, null, 1) ?? "null";
  return Response.json({
    ok: true,
    scannedBytes: scanned,
    truncated: json.length > maxChars,
    sample: json.slice(0, maxChars)
  });
}
