import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { getAgentByName } from "agents";
import {
  createIssue,
  createResourceMeta,
  getVersionInfo,
  listOpenIssues,
  versionUrl
} from "../speckle/client";
import { createLogger } from "../speckle/logging";
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
 * Durable because the load takes minutes. Steps have unlimited wall time and
 * retry independently, and — importantly — the load cannot live inside the
 * Durable Object: holding a DO invocation open across a multi-minute stream
 * trips "storage operation exceeded timeout" and the object is reset mid-run.
 *
 * Step results are capped at 1 MiB, so the index never travels through a step
 * return. Only counts and findings do; the data stays in the agent.
 */

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

    // Own step so a malformed instruction fails loudly before we spend a load.
    // Loaded from R2 so scouts can be edited in the UI without a redeploy.
    // Ids only: bodies are large and would count against the 1 MiB step-result
    // cap, so the inspect step re-reads them.
    const instructions = await step.do("load-instructions", async () => {
      const enabled = await loadEnabledScouts(this.env);
      if (enabled.length === 0) throw new Error("No enabled scouts");
      return enabled.map((instruction) => instruction.id);
    });

    const version = await step.do("resolve-version", async () => {
      const info = await getVersionInfo(
        this.env.SPECKLE_TOKEN,
        projectId,
        versionId
      );
      const found = info.version;
      if (!found?.referencedObject) {
        throw new Error(`Version ${versionId} has no root object`);
      }
      if (found.schemaVersion != null) {
        throw new Error(
          `Unsupported storage generation (schemaVersion ${found.schemaVersion})`
        );
      }
      return {
        rootObjectId: found.referencedObject,
        modelId: found.model?.id ?? null,
        modelName: found.model?.name ?? null,
        totalChildrenCount: found.totalChildrenCount,
        // Required by the resource-meta mutation that attaches the deltas.
        workspaceId: info.workspaceId
      };
    });

    const load = await step.do("index-version", async () => {
      const agent = await getAgentByName<Env, InspectionAgent>(
        this.env.InspectionAgent,
        versionId
      );
      await agent.beginRun(versionId, projectId);

      const result = await loadVersionIntoIndex({
        token: this.env.SPECKLE_TOKEN,
        projectId,
        rootObjectId: version.rootObjectId,
        ingest: (batch) => agent.ingestBatch(batch)
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

    const inspection = await step.do("inspect", async () => {
      if (!this.env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not configured");
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
    const novel = await step.do("dedupe", async () => {
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

    const issue = await step.do("create-issue", async () => {
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
    const meta = await step.do("attach-deltas", async () => {
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
