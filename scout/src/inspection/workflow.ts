import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { getAgentByName } from "agents";
import { getVersionInfo } from "../speckle/client";
import { createLogger } from "../speckle/logging";
import { loadVersionIntoIndex } from "./loader";
import type { InspectionAgent } from "./agent";

/**
 * Durable orchestration for one inspection run.
 *
 * The load has to live here rather than inside the Durable Object. Streaming
 * 160 MB takes minutes, and holding a DO invocation open across that trips
 * "Durable Object storage operation exceeded timeout which caused object to be
 * reset" — the object is torn down mid-run and the work is lost.
 *
 * A Workflow step has unlimited wall time, so the stream lives here and the
 * agent only ever sees short, discrete `ingestBatch` calls that complete
 * immediately. Steps also retry on their own, so a transient Speckle failure
 * does not lose the run.
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
        modelName: found.model?.name ?? null,
        totalChildrenCount: found.totalChildrenCount,
        packfileBytes: found.packfileSize ? Number(found.packfileSize) : null
      };
    });

    // Step results are capped at 1 MiB, so the index itself never travels
    // through a step return — only counts do. The data lives in the agent.
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
        totalLines: result.totalLines,
        candidateLines: result.candidateLines,
        skipped: result.skipped,
        megabytes: Math.round(result.bytes / 100_000) / 10,
        elapsedMs: result.elapsedMs
      };
    });

    logger.info("index_complete", { ...load, model: version.modelName });

    return { version, load };
  }
}
