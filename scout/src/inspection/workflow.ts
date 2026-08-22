import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { getAgentByName } from "agents";
import {
  createIssue,
  getVersionInfo,
  listOpenIssues,
  versionUrl
} from "../speckle/client";
import { createLogger } from "../speckle/logging";
import { loadEnabledInstructions } from "../instructions";
import { loadVersionIntoIndex } from "./loader";
import { runInstruction } from "./inspect";
import {
  extractFingerprints,
  fingerprint,
  renderSummaryIssue,
  sortFindings,
  type Finding
} from "./findings";
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
    const instructions = await step.do("load-instructions", async () => {
      const enabled = loadEnabledInstructions();
      if (enabled.length === 0) throw new Error("No enabled instructions");
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
        totalChildrenCount: found.totalChildrenCount
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

      for (const instructionId of instructions) {
        const instruction = loadEnabledInstructions().find(
          (item) => item.id === instructionId
        );
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

      return { findings: sortFindings(findings), estimatedCostUsd };
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

    logger.info("run_complete", {
      outcome: "issue_created",
      issue: issue.identifier,
      findings: novel.findings.length,
      estimatedCostUsd: inspection.estimatedCostUsd
    });

    return {
      outcome: "issue_created" as const,
      issue,
      findings: novel.findings.length,
      load
    };
  }
}
