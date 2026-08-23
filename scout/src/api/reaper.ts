import { getAgentByName } from "agents";
import { createLogger, errorMessage } from "../speckle/logging";
import { INDEX_TTL_SECONDS } from "../inspection/agent";
import type { InspectionAgent } from "../inspection/agent";
import { publishEvent } from "./events";
import {
  listPurgeableVersions,
  listUnfinishedRunsStalledSince,
  markVersionPurged,
  updateRun
} from "./runs";

/**
 * Reconciles the D1 run history against the Workflows engine.
 *
 * The terminal-failure handler in the workflow covers every failure the
 * instance can observe — but `exceededCpu` kills the isolate outright, and an
 * expired instance simply vanishes. Either way the D1 row stays "running"
 * forever and the UI reports a run that will never finish. This sweep is what
 * makes that state structurally impossible: any unfinished run whose last sign
 * of life is old enough gets resolved to the truth the engine holds, or to
 * `timed_out` when the engine no longer holds one.
 *
 * The InspectionAgent's own run row is deliberately left alone: the index is
 * disposable and the next `beginRun` resets it wholesale.
 */

/** How long a run may go without a heartbeat before the engine is consulted. */
const STALE_AFTER_MS = 30 * 60 * 1000;

/**
 * Absolute ceiling on run age. An instance the engine still calls "running"
 * past this is presumed wedged and is terminated — no legitimate load takes
 * six hours under the step timeouts now in force.
 */
const HARD_DEADLINE_MS = 6 * 60 * 60 * 1000;

export async function reapStuckRuns(env: Env): Promise<{
  swept: number;
  reaped: number;
}> {
  const logger = createLogger(crypto.randomUUID(), { source: "reaper" });
  const stale = await listUnfinishedRunsStalledSince(
    env,
    new Date(Date.now() - STALE_AFTER_MS)
  );
  if (stale.length === 0) return { swept: 0, reaped: 0 };

  let reaped = 0;
  for (const run of stale) {
    const resolved = await resolveAgainstEngine(
      env,
      run.instanceId,
      run.startedAt
    );
    if (!resolved) continue;
    reaped++;

    logger.warn("run_reaped", {
      instanceId: run.instanceId,
      versionId: run.versionId,
      startedAt: run.startedAt,
      lastProgressAt: run.lastProgressAt,
      ...resolved
    });
    await updateRun(env, run.instanceId, {
      status: resolved.status,
      error: resolved.error,
      finished: true
    });
    if (resolved.status !== "complete") {
      await publishEvent(env, {
        type: "run_failed",
        instanceId: run.instanceId,
        versionId: run.versionId,
        error: resolved.error ?? resolved.status,
        at: new Date().toISOString()
      });
    }
  }

  logger.info("reaper_swept", { swept: stale.length, reaped });
  return { swept: stale.length, reaped };
}

/**
 * Grace past the agent's own TTL before the sweep steps in. When the
 * self-destruct schedule works — the normal case — the object is already
 * gone by the time its versions clear this cutoff, and the sweep's destroy
 * call is a single throwaway wake that confirms it and stamps the rows.
 */
const PURGE_GRACE_MS = 60 * 60 * 1000;

/**
 * Destroy the InspectionAgent storage of versions whose runs are long over.
 *
 * The agents time out on their own (`expire` in `inspection/agent.ts`); this
 * sweep is the backstop that makes leaked storage structurally impossible:
 * objects from before the TTL existed, and runs whose isolate died before
 * `finishRun` could arm the timer. Driven by the D1 run history and stamped
 * back into it, so each version is woken for teardown exactly once —
 * SQLite-backed objects bill for storage until it is destroyed, and a
 * destroyed object must not be resurrected every sweep just to re-destroy it.
 */
export async function purgeExpiredIndexes(env: Env): Promise<{
  purged: number;
}> {
  const logger = createLogger(crypto.randomUUID(), { source: "purge" });
  const cutoff = new Date(
    Date.now() - INDEX_TTL_SECONDS * 1000 - PURGE_GRACE_MS
  );
  const versions = await listPurgeableVersions(env, cutoff);
  if (versions.length === 0) return { purged: 0 };

  let purged = 0;
  for (const versionId of versions) {
    try {
      const agent = await getAgentByName<Env, InspectionAgent>(
        env.InspectionAgent,
        versionId
      );
      // destroy() aborts the object's isolate, so the call may reject after
      // the storage is already gone — that rejection is success here.
      await agent.destroy().catch(() => {});
      await markVersionPurged(env, versionId);
      purged++;
    } catch (error) {
      // Left unstamped: the next sweep retries this version.
      logger.warn("purge_failed", { versionId, error: errorMessage(error) });
    }
  }

  logger.info("purge_swept", { candidates: versions.length, purged });
  return { purged };
}

/** What a stale row should become, or null to leave it for the next sweep. */
async function resolveAgainstEngine(
  env: Env,
  instanceId: string,
  startedAt: string
): Promise<{ status: string; error: string | null } | null> {
  let engine: InstanceStatus;
  try {
    const instance = await env.INSPECTION_WORKFLOW.get(instanceId);
    engine = await instance.status();
  } catch {
    // The engine no longer knows this id — retention expired or it never ran.
    return {
      status: "timed_out",
      error: "Workflow instance no longer known to the engine"
    };
  }

  switch (engine.status) {
    case "errored":
    case "terminated":
      return {
        status: "failed",
        error: engine.error
          ? `${engine.error.name}: ${engine.error.message}`
          : `Workflow instance ${engine.status}`
      };
    case "complete":
      // The instance finished but its final D1 write was lost. Findings and
      // issue link may be missing from the row; the terminal state is what
      // matters here.
      return { status: "complete", error: null };
    case "unknown":
      return { status: "timed_out", error: "Workflow instance state unknown" };
    default: {
      // Engine says it is alive. Trust it — up to the hard deadline.
      const age = Date.now() - new Date(startedAt).getTime();
      if (age < HARD_DEADLINE_MS) return null;
      try {
        const instance = await env.INSPECTION_WORKFLOW.get(instanceId);
        await instance.terminate();
      } catch {
        // Termination is best-effort; the row is resolved regardless.
      }
      return {
        status: "timed_out",
        error: `Run exceeded the ${HARD_DEADLINE_MS / 3_600_000}h hard deadline and was terminated`
      };
    }
  }
}
