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
import { updateRun } from "../api/runs";
import { loadVersionIntoIndex } from "./loader";
import { runInstruction } from "./inspect";
import {
  collapseDuplicates,
  extractFingerprints,
  fingerprint,
  renderSummaryIssue,
  type Finding
} from "./findings";
import { buildDeltas } from "./deltas";
import type { InspectionAgent } from "./agent";

/**
 * The whole pipeline for one published version:
 *
 *   VersionCreated -> LoadInstruction -> IndexVersion -> Inspect -> CreateIssue
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

/** Delta building queries the DO per finding before one Speckle mutation. */
const DELTAS_STEP: WorkflowStepConfig = {
  retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
  timeout: "10 minutes"
};

/**
 * Versions larger than this are declined up front with a `too_large` run
 * instead of dying mid-stream on the CPU limit. Calibration-pending: the
 * 160 MB reference model indexes comfortably; the 900 MB one does not. Both
 * bounds are logged on every run so the ceiling can be tuned from data.
 * Remove once chunked ingestion (Workstream B) lands.
 */
const MAX_TOTAL_CHILDREN = 500_000;
const MAX_PACKFILE_BYTES = 500 * 1024 * 1024;

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
    // Ids only: bodies are large and would count against the 1 MiB step-result
    // cap, so the inspect step re-reads them.
    const instructions = await step.do(
      "load-instructions",
      API_STEP,
      async () => {
        const enabled = await loadEnabledScouts(this.env);
        if (enabled.length === 0) {
          throw new NonRetryableError("No enabled scouts");
        }
        return enabled.map((instruction) => instruction.id);
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
        // Required by the resource-meta mutation that attaches the deltas.
        workspaceId: info.workspaceId
      };
    });

    // Size gate: decline up front what the streaming load cannot survive, as
    // a graceful terminal state rather than an hour of retry churn. Logged on
    // every run — over or under — so the thresholds can be calibrated.
    logger.info("version_size", {
      model: version.modelName,
      totalChildrenCount: version.totalChildrenCount,
      packfileBytes: version.packfileBytes
    });
    const tooLarge =
      (version.totalChildrenCount ?? 0) > MAX_TOTAL_CHILDREN ||
      (version.packfileBytes ?? 0) > MAX_PACKFILE_BYTES;
    if (tooLarge) {
      const message =
        `Version is too large to index: ${version.totalChildrenCount ?? "?"} objects` +
        ` (cap ${MAX_TOTAL_CHILDREN}), packfile ${version.packfileBytes ?? "?"} bytes` +
        ` (cap ${MAX_PACKFILE_BYTES}). Raising the cap needs chunked ingestion.`;
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

    const load = await step.do("index-version", LOAD_STEP, async () => {
      const agent = await getAgentByName<Env, InspectionAgent>(
        this.env.InspectionAgent,
        versionId
      );
      await agent.beginRun(versionId, projectId);

      // Heartbeat: proof of life for the reaper and the UI. Throttled and
      // fire-and-forget — a lost beat must never fail the load.
      let lastBeat = 0;
      const result = await loadVersionIntoIndex({
        token: this.env.SPECKLE_TOKEN,
        projectId,
        rootObjectId: version.rootObjectId,
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

    const inspection = await step.do("inspect", INSPECT_STEP, async () => {
      if (!this.env.ANTHROPIC_API_KEY) {
        throw new NonRetryableError("ANTHROPIC_API_KEY is not configured");
      }
      const agent = await getAgentByName<Env, InspectionAgent>(
        this.env.InspectionAgent,
        versionId
      );

      const findings: Finding[] = [];
      let estimatedCostUsd = 0;
      const scouts = await loadEnabledScouts(this.env);

      for (const instructionId of instructions) {
        const instruction = scouts.find((item) => item.id === instructionId);
        if (!instruction) continue;

        const result = await runInstruction({
          apiKey: this.env.ANTHROPIC_API_KEY,
          instruction,
          agent,
          modelName: version.modelName,
          logger
        });

        // A systemic failure must not look like a clean model — fail the step
        // so it retries rather than filing "no findings".
        if (result.stoppedBecause === "failed") {
          throw new Error(`Inspection failed: ${result.error ?? "unknown"}`);
        }

        findings.push(...result.findings);
        estimatedCostUsd += result.usage.estimatedCostUsd;
      }

      // Collapse the same problem seen through denormalized parameters.
      return { findings: collapseDuplicates(findings), estimatedCostUsd };
    });

    // Dedupe against what is already open on the project, so republishing a
    // model with an unfixed problem does not file it again.
    const novel = await step.do("dedupe", API_STEP, async () => {
      const withPrints = await Promise.all(
        inspection.findings.map(async (finding) => ({
          finding,
          print: await fingerprint(finding)
        }))
      );

      if (!SUPPRESS_ALREADY_REPORTED) {
        logger.info("dedupe_skipped", { findings: withPrints.length });
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

    if (novel.findings.length === 0) {
      await updateRun(this.env, event.instanceId, {
        status: "no_findings",
        findings: 0,
        deltas: 0,
        costUsd: inspection.estimatedCostUsd,
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
        totalFindings: inspection.findings.length,
        estimatedCostUsd: inspection.estimatedCostUsd
      });
      return {
        outcome: "no_new_findings" as const,
        findings: inspection.findings.length,
        load
      };
    }

    const issue = await step.do("create-issue", API_STEP, async () => {
      const rendered = renderSummaryIssue({
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
        // No anchor: pinning to the version needs a viewerState and screenshot
        // alongside the resource id, which are out of scope.
        description: rendered.description + link
      });

      return { identifier: created.identifier, id: created.id };
    });

    // Attach the proposed edits, mirroring Speckle's parameter updater, so the
    // issue carries fixes to review rather than only a description of what is
    // wrong. Non-fatal: the issue is already filed and useful without it.
    const meta = await step.do("attach-deltas", DELTAS_STEP, async () => {
      if (!version.workspaceId) {
        logger.warn("deltas_skipped", { reason: "no workspaceId" });
        return { attached: 0 };
      }

      const agent = await getAgentByName<Env, InspectionAgent>(
        this.env.InspectionAgent,
        versionId
      );
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

      return {
        attached: built.deltas.length,
        actionableFindings: built.actionableFindings
      };
    });

    await updateRun(this.env, event.instanceId, {
      status: "complete",
      findings: novel.findings.length,
      deltas: meta.attached,
      costUsd: inspection.estimatedCostUsd,
      issueIdentifier: issue.identifier,
      finished: true
    });
    await publishEvent(this.env, {
      type: "run_complete",
      instanceId: event.instanceId,
      versionId,
      outcome: "issue_created",
      findings: novel.findings.length,
      deltas: meta.attached,
      issueIdentifier: issue.identifier,
      at: new Date().toISOString()
    });

    logger.info("run_complete", {
      outcome: "issue_created",
      issue: issue.identifier,
      findings: novel.findings.length,
      deltasAttached: meta.attached,
      estimatedCostUsd: inspection.estimatedCostUsd
    });

    return {
      outcome: "issue_created" as const,
      issue,
      findings: novel.findings.length,
      deltas: meta.attached,
      load
    };
  }
}
