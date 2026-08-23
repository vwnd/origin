import { SPECKLE_SERVER_URL } from "../speckle/config";
import { DATA_OBJECT_MARKER, toIndexedObject } from "./properties";
import type { IndexedObject } from "./properties";

/**
 * Streams a version's object graph into the index.
 *
 * `GET /objects/{projectId}/{objectId}` with `Accept: text/plain` returns one
 * object per line as `{id}\t{json}`. The default `application/json` returns a
 * single array, which would have to be buffered whole — for a 160 MB version
 * that is not an option, so the line format is what makes this feasible.
 *
 * Two things keep this inside Worker limits:
 *
 * - **Nothing accumulates.** Lines are consumed as they arrive and batches are
 *   handed to the agent and dropped; peak memory is one batch.
 * - **Most lines are never parsed.** Geometry is the overwhelming majority of
 *   the bytes, so each raw line is substring-tested for the DataObject marker
 *   before `JSON.parse` is paid for. Meshes are rejected on a string compare.
 */

/** Objects per RPC to the agent. Large enough to amortise, small enough to stay cheap. */
const BATCH_SIZE = 200;

/**
 * Abort the download when the stream goes quiet for this long. Without it a
 * stalled connection holds the workflow step open until the step timeout —
 * minutes of dead air that look identical to a slow load.
 */
const STALL_TIMEOUT_MS = 60_000;

export type LoadResult = {
  /** Lines seen in the stream, geometry included. */
  totalLines: number;
  /** Lines that passed the DataObject marker test. */
  candidateLines: number;
  indexedObjects: number;
  indexedProperties: number;
  /** Lines that looked like DataObjects but could not be parsed or indexed. */
  skipped: number;
  bytes: number;
  elapsedMs: number;
};

export async function loadVersionIntoIndex(options: {
  token: string;
  projectId: string;
  rootObjectId: string;
  /**
   * Sink for each batch. The agent passes its own method, so rows are written
   * in-process rather than serialized across a Durable Object RPC boundary.
   */
  ingest: (batch: IndexedObject[]) => Promise<{
    objects: number;
    properties: number;
  }>;
  onProgress?: (progress: { lines: number; objects: number }) => void;
}): Promise<LoadResult> {
  const { token, projectId, rootObjectId, ingest } = options;
  const started = Date.now();

  // Stall watchdog: re-armed on every chunk; firing aborts the fetch so the
  // step fails fast with a diagnosable error instead of waiting out its
  // timeout.
  const stall = new AbortController();
  let stalled = false;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const armStallTimer = () => {
    if (stallTimer !== undefined) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      stalled = true;
      stall.abort();
    }, STALL_TIMEOUT_MS);
  };

  armStallTimer();
  const response = await fetch(
    `${SPECKLE_SERVER_URL}/objects/${projectId}/${rootObjectId}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "text/plain"
      },
      signal: stall.signal
    }
  );

  try {
    if (!response.ok || !response.body) {
      throw new Error(
        `Speckle object download failed: ${response.status} ${response.statusText}`
      );
    }

    return await consume(response.body);
  } catch (error) {
    if (stalled) {
      throw new Error(
        `Speckle stream stalled: no bytes received for ${STALL_TIMEOUT_MS / 1000}s`
      );
    }
    throw error;
  } finally {
    if (stallTimer !== undefined) clearTimeout(stallTimer);
  }

  async function consume(
    body: ReadableStream<Uint8Array>
  ): Promise<LoadResult> {
    const reader = body.getReader();
    const decoder = new TextDecoder();

    let carry = "";
    let bytes = 0;
    let totalLines = 0;
    let candidateLines = 0;
    let indexedObjects = 0;
    let indexedProperties = 0;
    let skipped = 0;
    let batch: IndexedObject[] = [];

    const flush = async () => {
      if (batch.length === 0) return;
      const stats = await ingest(batch);
      indexedObjects += stats.objects;
      indexedProperties += stats.properties;
      batch = [];
      options.onProgress?.({ lines: totalLines, objects: indexedObjects });
    };

    const handleLine = async (line: string) => {
      if (line.length === 0) return;
      totalLines++;

      // The cheap gate: reject geometry without parsing it.
      if (!line.includes(DATA_OBJECT_MARKER)) return;
      candidateLines++;

      const tab = line.indexOf("\t");
      if (tab === -1) {
        skipped++;
        return;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line.slice(tab + 1)) as Record<string, unknown>;
      } catch {
        skipped++;
        return;
      }

      const indexed = toIndexedObject(parsed);
      if (!indexed) {
        skipped++;
        return;
      }

      batch.push(indexed);
      if (batch.length >= BATCH_SIZE) await flush();
    };

    for (;;) {
      const { done, value } = await reader.read();
      armStallTimer();
      if (done) break;
      bytes += value.byteLength;
      carry += decoder.decode(value, { stream: true });

      // Consume whole lines out of the carry buffer so it never grows beyond
      // one partial line — this is what bounds memory across a 160 MB stream.
      let newline: number;
      while ((newline = carry.indexOf("\n")) !== -1) {
        const line = carry.slice(0, newline);
        carry = carry.slice(newline + 1);
        await handleLine(line);
      }
    }

    carry += decoder.decode();
    if (carry.length > 0) await handleLine(carry);
    await flush();

    return {
      totalLines,
      candidateLines,
      indexedObjects,
      indexedProperties,
      skipped,
      bytes,
      elapsedMs: Date.now() - started
    };
  }
}
