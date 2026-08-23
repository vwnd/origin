import { WorkflowEntrypoint } from "cloudflare:workers";
import type {
  WorkflowEvent,
  WorkflowStep,
  WorkflowStepConfig
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { getAgentByName } from "agents";
import {
  createIssue,
  createResourceMeta,
  getVersionInfo,
  listOpenIssues,
  versionUrl
} from "../speckle/client";
import { createLogger, errorMessage } from "../speckle/logging";
import type { Logger } from "../speckle/logging";
import { loadEnabledScouts } from "../scouts/store";
import { publishEvent } from "../api/events";
import { recordScoutRunStarted, updateRun, updateScoutRun } from "../api/runs";
import { loadVersionIntoIndex } from "./loader";
import { fetchRootObject, refsOf, walkChunk } from "./walker";
import { toIndexedObject } from "./properties";
import { runInstruction } from "./inspect";
import {
  collapseDuplicates,
  extractFingerprints,
  fingerprint,
  renderScoutIssue
} from "./findings";
import { buildDeltas } from "./deltas";
import type { InspectionAgent } from "./agent";

/**
 * The whole pipeline for one published version:
 *
 *   VersionCreated -> LoadInstructions -> IndexVersion
 *     -> in parallel, per enabled scout:
 *          Inspect -> Dedupe -> CreateIssue -> AttachDeltas
 *
 * The version is indexed once — that is the expensive part — and then every
 * active scout runs against the shared index concurrently, each filing its
 * own issue with its own fixes, so the inbox shows one issue per scout and
 * the fleet costs the wall-clock of its slowest member, not their sum.
 *
 * Durable because the load takes minutes. Each step carries an explicit
 * StepConfig — the platform default (10-minute timeout, 5 retries) is wrong
 * for every step here: the load must not re-download gigabytes five times,
 * and API calls should give up far sooner. Importantly, the load cannot live
 * inside the Durable Object: holding a DO invocation open across a
 * multi-minute stream trips "storage operation exceeded timeout" and the
 * object is reset mid-run.
 *
 * Step results are capped at 1 MiB, so the index never travels through a step
 * return. Only counts and findings do; the data stays in the agent.
 *
 * Failure is a first-class outcome: `run()` resolves the D1 row and the DO to
 * a terminal state on any error it can observe, and the reaper cron
 * (`api/reaper.ts`) covers the ones it cannot — `exceededCpu` kills the
 * isolate without running a catch block.
 */

/** Small Speckle/D1 API calls: fail fast, retry a few times. */
const API_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
  timeout: "2 minutes"
};

/**
 * The streaming load. One retry only — every attempt re-downloads the whole
 * version from byte zero, so retrying five times would turn one bad stream
 * into an hour of churn. The stall watchdog in the loader aborts a dead
 * stream long before the timeout does.
 */
const LOAD_STEP: WorkflowStepConfig = {
  retries: { limit: 1, delay: "30 seconds", backoff: "constant" },
  timeout: "45 minutes"
};

/** Model-judged steps: long enough for many Anthropic calls, few retries. */
const INSPECT_STEP: WorkflowStepConfig = {
  retries: { limit: 2, delay: "30 seconds", backoff: "exponential" },
  timeout: "20 minutes"
};

/** Root fetch + frontier seed. The root's closure can be several MB. */
const WALK_SEED_STEP: WorkflowStepConfig = {
  retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
  timeout: "5 minutes"
};

/** One frontier chunk: ~20 getobjects requests plus ingest RPCs. */
const WALK_CHUNK_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
  timeout: "10 minutes"
};

/** Frontier ids fetched per walk step — bounds CPU and wall time per step. */
const WALK_CHUNK_IDS = 10_000;

/** Ids per enqueue RPC, keeping Durable Object call payloads modest. */
const ENQUEUE_SLICE = 5_000;

/** Runaway guard: 500 chunks x 10k ids is far beyond any real model. */
const MAX_WALK_CHUNKS = 500;

/** Delta building queries the DO per finding before one Speckle mutation. */
const DELTAS_STEP: WorkflowStepConfig = {
  retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
  timeout: "10 minutes"
};

/**
 * Size gates. Revit versions take the selective walk (geometry never
 * travels, chunked steps), so only a runaway bound on object count applies.
 * Everything else still takes the single-step streaming load, whose CPU
 * ceiling the Phase 1 measurements put near these bounds — see
 * docs/large-model-ingestion-plan.md.
 */
const MAX_WALK_CHILDREN = 2_000_000;
const MAX_STREAM_CHILDREN = 500_000;
const MAX_STREAM_PACKFILE_BYTES = 500 * 1024 * 1024;

/**
 * Whether findings already reported in an open issue are suppressed.
 *
 * Off for now: every run files everything it finds. Dedupe is correct
 * behaviour for a project in steady use — it stops a republished model
 * re-filing the same problem — but while iterating it hides exactly the
 * findings you are trying to see, because the first run of the day claims them
 * and every later run reports "no new findings".
 *
 * Fingerprints are still written into each issue, so flipping this back to
 * `true` restores suppression with no other change and the existing issues
 * remain readable as history.
 */
const SUPPRESS_ALREADY_REPORTED = false;

export type InspectionParams = {
  projectId: string;
  versionId: string;
};

/** What one scout's chain contributes to the run's totals. */
type ScoutOutcome = {
  findings: number;
  deltas: number;
  costUsd: number;
  issueIdentifier: string | null;
};

export class InspectionWorkflow extends WorkflowEntrypoint<
  Env,
  InspectionParams
> {
  async run(event: WorkflowEvent<InspectionParams>, step: WorkflowStep) {
    const { projectId, versionId } = event.payload;
    const logger = createLogger(crypto.randomUUID(), { projectId, versionId });

    try {
      return await this.pipeline(event, step, logger);
    } catch (error) {
      // Terminal-failure handler: whatever escaped its step's retries ends the
      // run in an honest state instead of leaving "running" rows behind. The
      // rethrow still marks the instance errored for the engine's records.
      const message = errorMessage(error);
      logger.error("run_failed", { error: message });
      await updateRun(this.env, event.instanceId, {
        status: "failed",
        error: message,
        finished: true
      });
      await publishEvent(this.env, {
        type: "run_failed",
        instanceId: event.instanceId,
        versionId,
        error: message,
        at: new Date().toISOString()
      });
      try {
        const agent = await getAgentByName<Env, InspectionAgent>(
          this.env.InspectionAgent,
          versionId
        );
        await agent.finishRun("failed", message);
      } catch {
        // The DO row is cosmetic next to the D1 record — a mid-reset object
        // must not mask the real error.
      }
      throw error;
    }
  }

  private async pipeline(
    event: WorkflowEvent<InspectionParams>,
    step: WorkflowStep,
    logger: Logger
  ) {
    const { projectId, versionId } = event.payload;

    // Own step so a malformed instruction fails loudly before we spend a load.
    // Loaded from R2 so scouts can be edited in the UI without a redeploy.
    // Ids and titles only: bodies are large and would count against the 1 MiB
    // step-result cap, so each scout's inspect step re-reads its own.
    const instructions = await step.do(
      "load-instructions",
      API_STEP,
      async () => {
        const enabled = await loadEnabledScouts(this.env);
        if (enabled.length === 0) {
          throw new NonRetryableError("No enabled scouts");
        }
        return enabled.map(({ id, title }) => ({ id, title }));
      }
    );

    const version = await step.do("resolve-version", API_STEP, async () => {
      const info = await getVersionInfo(
        this.env.SPECKLE_TOKEN,
        projectId,
        versionId
      );
      const found = info.version;
      if (!found?.referencedObject) {
        throw new NonRetryableError(`Version ${versionId} has no root object`);
      }
      if (found.schemaVersion != null) {
        throw new NonRetryableError(
          `Unsupported storage generation (schemaVersion ${found.schemaVersion})`
        );
      }
      return {
        rootObjectId: found.referencedObject,
        modelId: found.model?.id ?? null,
        modelName: found.model?.name ?? null,
        totalChildrenCount: found.totalChildrenCount,
        packfileBytes: found.packfileSize ? Number(found.packfileSize) : null,
        sourceApplication: found.sourceApplication,
        // Required by the resource-meta mutation that attaches the deltas.
        workspaceId: info.workspaceId
      };
    });

    // Revit commits take the selective walk: geometry is never downloaded and
    // the work is spread across bounded steps. Other source applications keep
    // the streaming load — the walk's prune rules only know Revit's shape.
    const useWalk = (version.sourceApplication ?? "")
      .toLowerCase()
      .includes("revit");

    // Size gate: decline up front what the chosen path cannot survive, as a
    // graceful terminal state rather than an hour of retry churn. Logged on
    // every run — over or under — so the thresholds can be calibrated.
    logger.info("version_size", {
      model: version.modelName,
      totalChildrenCount: version.totalChildrenCount,
      packfileBytes: version.packfileBytes,
      sourceApplication: version.sourceApplication,
      path: useWalk ? "walk" : "stream"
    });
    const tooLarge = useWalk
      ? (version.totalChildrenCount ?? 0) > MAX_WALK_CHILDREN
      : (version.totalChildrenCount ?? 0) > MAX_STREAM_CHILDREN ||
        (version.packfileBytes ?? 0) > MAX_STREAM_PACKFILE_BYTES;
    if (tooLarge) {
      const message = useWalk
        ? `Version is too large to index: ${version.totalChildrenCount ?? "?"} objects` +
          ` exceeds the walk's runaway cap of ${MAX_WALK_CHILDREN}.`
        : `Version is too large to stream: ${version.totalChildrenCount ?? "?"} objects` +
          ` (cap ${MAX_STREAM_CHILDREN}), packfile ${version.packfileBytes ?? "?"} bytes` +
          ` (cap ${MAX_STREAM_PACKFILE_BYTES}). Only Revit versions take the` +
          ` selective walk today.`;
      logger.warn("run_too_large", { model: version.modelName });
      await updateRun(this.env, event.instanceId, {
        status: "too_large",
        modelName: version.modelName,
        error: message,
        finished: true
      });
      await publishEvent(this.env, {
        type: "run_failed",
        instanceId: event.instanceId,
        versionId,
        error: message,
        at: new Date().toISOString()
      });
      return { outcome: "too_large" as const, load: null };
    }

    const load = useWalk
      ? await this.walkVersion(event, step, logger, version.rootObjectId)
      : await this.streamVersion(event, step, version.rootObjectId);

    logger.info("index_complete", { ...load, model: version.modelName });

    await updateRun(this.env, event.instanceId, {
      status: "inspecting",
      modelName: version.modelName,
      indexedObjects: load.indexedObjects
    });
    await publishEvent(this.env, {
      type: "run_progress",
      instanceId: event.instanceId,
      versionId,
      step: "indexed",
      detail: { objects: load.indexedObjects, model: version.modelName },
      at: new Date().toISOString()
    });

    // The whole fleet runs at once: each scout is its own chain of steps —
    // inspect, dedupe, file, attach — and the chains only share the index,
    // which is read-only by now, so two scouts cost the wall-clock of one.
    // allSettled so one scout's failure cannot cancel another's filing; the
    // run still resolves failed afterwards if any chain did.
    const outcomes = await Promise.allSettled(
      instructions.map((scout) =>
        this.runScout(event, step, logger, scout, version)
      )
    );

    const results = outcomes
      .filter(
        (outcome): outcome is PromiseFulfilledResult<ScoutOutcome | null> =>
          outcome.status === "fulfilled"
      )
      .map((outcome) => outcome.value)
      .filter((value): value is ScoutOutcome => value !== null);

    const totals = results.reduce(
      (acc, result) => ({
        findings: acc.findings + result.findings,
        deltas: acc.deltas + result.deltas,
        costUsd: acc.costUsd + result.costUsd
      }),
      { findings: 0, deltas: 0, costUsd: 0 }
    );
    const filed = results
      .map((result) => result.issueIdentifier)
      .filter((identifier): identifier is string => identifier !== null);

    const failure = outcomes.find(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === "rejected"
    );
    if (failure) {
      // Bank what the successful scouts achieved before the run resolves
      // failed — their issues are already filed and must stay counted.
      await updateRun(this.env, event.instanceId, {
        findings: totals.findings,
        deltas: totals.deltas,
        costUsd: totals.costUsd,
        issueIdentifier: filed.length > 0 ? filed.join(", ") : null
      });
      throw failure.reason;
    }

    if (filed.length === 0) {
      await updateRun(this.env, event.instanceId, {
        status: "no_findings",
        findings: 0,
        deltas: 0,
        costUsd: totals.costUsd,
        finished: true
      });
      await publishEvent(this.env, {
        type: "run_complete",
        instanceId: event.instanceId,
        versionId,
        outcome: "no_new_findings",
        findings: 0,
        deltas: 0,
        issueIdentifier: null,
        at: new Date().toISOString()
      });
      logger.info("run_complete", {
        outcome: "no_new_findings",
        scouts: instructions.length,
        estimatedCostUsd: totals.costUsd
      });
      return { outcome: "no_new_findings" as const, findings: 0, load };
    }

    // Several scouts may each have filed an issue; the run record and the
    // toast carry all of their identifiers.
    const issueIdentifier = filed.join(", ");

    await updateRun(this.env, event.instanceId, {
      status: "complete",
      findings: totals.findings,
      deltas: totals.deltas,
      costUsd: totals.costUsd,
      issueIdentifier,
      finished: true
    });
    await publishEvent(this.env, {
      type: "run_complete",
      instanceId: event.instanceId,
      versionId,
      outcome: "issue_created",
      findings: totals.findings,
      deltas: totals.deltas,
      issueIdentifier,
      at: new Date().toISOString()
    });

    logger.info("run_complete", {
      outcome: "issue_created",
      issues: filed,
      findings: totals.findings,
      deltasAttached: totals.deltas,
      estimatedCostUsd: totals.costUsd
    });

    return {
      outcome: "issue_created" as const,
      issues: filed,
      findings: totals.findings,
      deltas: totals.deltas,
      load
    };
  }

  /**
   * One scout's whole run: inspect the shared index, dedupe, file its issue,
   * attach its fixes. Every phase transition lands in the `scout_runs` table
   * so the Analytics page can watch the fleet member by member.
   *
   * Returns null for a scout that vanished mid-run; throws on real failure
   * after marking its own row failed, leaving the other chains untouched.
   */
  private async runScout(
    event: WorkflowEvent<InspectionParams>,
    step: WorkflowStep,
    logger: Logger,
    scout: { id: string; title: string },
    version: {
      modelId: string | null;
      modelName: string | null;
      workspaceId: string | null;
    }
  ): Promise<ScoutOutcome | null> {
    const { projectId, versionId } = event.payload;

    await recordScoutRunStarted(this.env, {
      instanceId: event.instanceId,
      scoutId: scout.id,
      scoutTitle: scout.title
    });

    try {
      const inspected = await step.do(
        `inspect-${scout.id}`,
        INSPECT_STEP,
        async () => {
          if (!this.env.ANTHROPIC_API_KEY) {
            throw new NonRetryableError("ANTHROPIC_API_KEY is not configured");
          }
          // Re-read the body from the store; a scout disabled or deleted
          // since the run began is skipped rather than failed.
          const instruction = (await loadEnabledScouts(this.env)).find(
            (item) => item.id === scout.id
          );
          if (!instruction) return null;

          const agent = await this.agentFor(versionId);
          const result = await runInstruction({
            apiKey: this.env.ANTHROPIC_API_KEY,
            instruction,
            agent,
            modelName: version.modelName,
            logger
          });

          // A systemic failure must not look like a clean model — fail the
          // step so it retries rather than filing "no findings".
          if (result.stoppedBecause === "failed") {
            throw new Error(`Inspection failed: ${result.error ?? "unknown"}`);
          }

          // Collapse the same problem seen through denormalized parameters.
          return {
            findings: collapseDuplicates(result.findings),
            estimatedCostUsd: result.usage.estimatedCostUsd
          };
        }
      );

      if (!inspected) {
        await updateScoutRun(this.env, event.instanceId, scout.id, {
          status: "skipped",
          finished: true
        });
        return null;
      }

      // Dedupe against what is already open on the project, so republishing
      // a model with an unfixed problem does not file it again.
      const novel = await step.do(`dedupe-${scout.id}`, API_STEP, async () => {
        const withPrints = await Promise.all(
          inspected.findings.map(async (finding) => ({
            finding,
            print: await fingerprint(finding)
          }))
        );

        if (!SUPPRESS_ALREADY_REPORTED) {
          logger.info("dedupe_skipped", {
            scout: scout.id,
            findings: withPrints.length
          });
          return {
            findings: withPrints.map((entry) => entry.finding),
            fingerprints: withPrints.map((entry) => entry.print)
          };
        }

        const open = await listOpenIssues(this.env.SPECKLE_TOKEN, projectId);
        const seen = extractFingerprints(
          open.map((issue) => issue.rawDescription)
        );

        const fresh = withPrints.filter((entry) => !seen.has(entry.print));
        logger.info("dedupe_complete", {
          scout: scout.id,
          found: withPrints.length,
          alreadyOpen: withPrints.length - fresh.length,
          novel: fresh.length,
          openIssuesScanned: open.length
        });

        return {
          findings: fresh.map((entry) => entry.finding),
          fingerprints: fresh.map((entry) => entry.print)
        };
      });

      // Liveness while the fleet works: parallel inspections can quietly
      // outlast the reaper's stall window even though each step is healthy.
      await updateRun(this.env, event.instanceId, { heartbeat: true });

      if (novel.findings.length === 0) {
        await updateScoutRun(this.env, event.instanceId, scout.id, {
          status: "no_findings",
          findings: 0,
          deltas: 0,
          costUsd: inspected.estimatedCostUsd,
          finished: true
        });
        await publishEvent(this.env, {
          type: "run_progress",
          instanceId: event.instanceId,
          versionId,
          step: "scout_complete",
          detail: { scout: scout.title, findings: 0, issue: null },
          at: new Date().toISOString()
        });
        return {
          findings: 0,
          deltas: 0,
          costUsd: inspected.estimatedCostUsd,
          issueIdentifier: null
        };
      }

      await updateScoutRun(this.env, event.instanceId, scout.id, {
        status: "filing",
        findings: novel.findings.length,
        costUsd: inspected.estimatedCostUsd
      });

      const issue = await step.do(
        `create-issue-${scout.id}`,
        API_STEP,
        async () => {
          const rendered = renderScoutIssue({
            scoutTitle: scout.title,
            findings: novel.findings,
            fingerprints: novel.fingerprints,
            versionId,
            modelName: version.modelName
          });

          const link = version.modelId
            ? `\n\n${versionUrl(projectId, version.modelId, versionId)}`
            : "";

          const created = await createIssue(this.env.SPECKLE_TOKEN, {
            projectId,
            title: rendered.title,
            // No anchor: pinning to the version needs a viewerState and
            // screenshot alongside the resource id, which are out of scope.
            description: rendered.description + link
          });

          return { identifier: created.identifier, id: created.id };
        }
      );

      // Attach the proposed edits, mirroring Speckle's parameter updater, so
      // the issue carries fixes to review rather than only a description of
      // what is wrong. Non-fatal: the issue is already filed and useful
      // without it.
      const meta = await step.do(
        `attach-deltas-${scout.id}`,
        DELTAS_STEP,
        async () => {
          if (!version.workspaceId) {
            logger.warn("deltas_skipped", { reason: "no workspaceId" });
            return { attached: 0 };
          }

          const agent = await this.agentFor(versionId);
          const built = await buildDeltas({
            findings: novel.findings,
            agent,
            logger
          });
          if (built.deltas.length === 0) return { attached: 0 };

          await createResourceMeta(this.env.SPECKLE_TOKEN, {
            projectId,
            workspaceId: version.workspaceId,
            issueId: issue.id,
            changes: built.deltas
          });

          return { attached: built.deltas.length };
        }
      );

      await updateScoutRun(this.env, event.instanceId, scout.id, {
        status: "complete",
        findings: novel.findings.length,
        deltas: meta.attached,
        costUsd: inspected.estimatedCostUsd,
        issueIdentifier: issue.identifier,
        finished: true
      });
      await publishEvent(this.env, {
        type: "run_progress",
        instanceId: event.instanceId,
        versionId,
        step: "scout_complete",
        detail: {
          scout: scout.title,
          findings: novel.findings.length,
          deltas: meta.attached,
          issue: issue.identifier
        },
        at: new Date().toISOString()
      });

      return {
        findings: novel.findings.length,
        deltas: meta.attached,
        costUsd: inspected.estimatedCostUsd,
        issueIdentifier: issue.identifier
      };
    } catch (error) {
      await updateScoutRun(this.env, event.instanceId, scout.id, {
        status: "failed",
        error: errorMessage(error),
        finished: true
      });
      throw error;
    }
  }

  /** What both index paths report back to the pipeline. */
  private async agentFor(versionId: string) {
    return getAgentByName<Env, InspectionAgent>(
      this.env.InspectionAgent,
      versionId
    );
  }

  /**
   * The original single-step streaming load. Kept for non-Revit commits,
   * whose object graphs the walk's prune rules do not know.
   */
  private async streamVersion(
    event: WorkflowEvent<InspectionParams>,
    step: WorkflowStep,
    rootObjectId: string
  ) {
    const { projectId, versionId } = event.payload;

    return step.do("index-version", LOAD_STEP, async () => {
      const agent = await this.agentFor(versionId);
      await agent.beginRun(versionId, projectId);

      // Heartbeat: proof of life for the reaper and the UI. Throttled and
      // fire-and-forget — a lost beat must never fail the load.
      let lastBeat = 0;
      const result = await loadVersionIntoIndex({
        token: this.env.SPECKLE_TOKEN,
        projectId,
        rootObjectId,
        ingest: (batch) => agent.ingestBatch(batch),
        onProgress: ({ objects }) => {
          const now = Date.now();
          if (now - lastBeat < 30_000) return;
          lastBeat = now;
          void updateRun(this.env, event.instanceId, {
            heartbeat: true,
            indexedObjects: objects
          }).catch(() => {});
        }
      });

      await agent.finishRun("indexed");
      return {
        indexedObjects: result.indexedObjects,
        indexedProperties: result.indexedProperties,
        megabytes: Math.round(result.bytes / 100_000) / 10,
        elapsedMs: result.elapsedMs
      };
    });
  }

  /**
   * The selective walk: seed the frontier from the root object, then drain
   * it in bounded chunks — one workflow step each, so a retry re-fetches one
   * slice instead of the whole model, and CPU per invocation stays far under
   * the limit that killed the streaming load at 863 MB.
   *
   * Every mutation along the way is idempotent (frontier enqueue is INSERT OR
   * IGNORE, ingest is INSERT OR REPLACE, claims survive a dead attempt), so
   * step retries are safe by construction.
   */
  private async walkVersion(
    event: WorkflowEvent<InspectionParams>,
    step: WorkflowStep,
    logger: Logger,
    rootObjectId: string
  ) {
    const { projectId, versionId } = event.payload;

    const seed = await step.do("walk-seed", WALK_SEED_STEP, async () => {
      const agent = await this.agentFor(versionId);
      await agent.beginRun(versionId, projectId);

      const root = await fetchRootObject({
        token: this.env.SPECKLE_TOKEN,
        projectId,
        rootObjectId
      });
      // A root that is itself a DataObject (single-element publish) still
      // belongs in the index.
      const indexed = toIndexedObject(root.object);
      if (indexed) await agent.ingestBatch([indexed]);
      const enqueued = await agent.enqueueFrontier(refsOf(root.object));
      return { enqueued, bytes: root.bytes, indexed: indexed ? 1 : 0 };
    });

    const totals = {
      indexedObjects: seed.indexed,
      indexedProperties: 0,
      bytes: seed.bytes,
      requests: 1,
      elapsedMs: 0
    };

    for (let chunk = 0; ; chunk++) {
      if (chunk >= MAX_WALK_CHUNKS) {
        throw new Error(
          `Walk exceeded ${MAX_WALK_CHUNKS} chunks — runaway frontier?`
        );
      }

      const result = await step.do(
        `walk-chunk-${chunk}`,
        WALK_CHUNK_STEP,
        async () => {
          const started = Date.now();
          const agent = await this.agentFor(versionId);
          const ids = await agent.claimFrontier(WALK_CHUNK_IDS);
          if (ids.length === 0) {
            return {
              fetched: 0,
              indexedObjects: 0,
              indexedProperties: 0,
              bytes: 0,
              requests: 0,
              enqueued: 0,
              remaining: 0,
              elapsedMs: 0
            };
          }

          const walked = await walkChunk({
            token: this.env.SPECKLE_TOKEN,
            projectId,
            ids,
            ingest: (batch) => agent.ingestBatch(batch)
          });

          let enqueued = 0;
          for (let i = 0; i < walked.refs.length; i += ENQUEUE_SLICE) {
            enqueued += await agent.enqueueFrontier(
              walked.refs.slice(i, i + ENQUEUE_SLICE)
            );
          }
          await agent.completeClaimed();
          const remaining = await agent.frontierRemaining();

          return {
            fetched: walked.fetched,
            indexedObjects: walked.indexedObjects,
            indexedProperties: walked.indexedProperties,
            bytes: walked.bytes,
            requests: walked.requests,
            enqueued,
            remaining,
            elapsedMs: Date.now() - started
          };
        }
      );

      totals.indexedObjects += result.indexedObjects;
      totals.indexedProperties += result.indexedProperties;
      totals.bytes += result.bytes;
      totals.requests += result.requests;
      totals.elapsedMs += result.elapsedMs;

      logger.info("walk_chunk", { chunk, ...result });
      // Between-step heartbeat: chunks are the walk's unit of liveness.
      await updateRun(this.env, event.instanceId, {
        heartbeat: true,
        indexedObjects: totals.indexedObjects
      });

      if (result.remaining === 0) break;
    }

    await step.do("walk-finish", API_STEP, async () => {
      const agent = await this.agentFor(versionId);
      await agent.finishRun("indexed");
    });

    return {
      indexedObjects: totals.indexedObjects,
      indexedProperties: totals.indexedProperties,
      megabytes: Math.round(totals.bytes / 100_000) / 10,
      elapsedMs: totals.elapsedMs
    };
  }
}
