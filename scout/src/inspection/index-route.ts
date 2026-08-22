import { getAgentByName } from "agents";
import { getVersionInfo } from "../speckle/client";
import { createLogger } from "../speckle/logging";
import type { InspectionAgent } from "./agent";

/**
 * Stage A driver: index one version and report what landed.
 *
 * Runs the load inline so the caller sees timings and counts directly. In the
 * finished pipeline this moves into a Workflow step, because a Worker request
 * has no durable retry and a large model can take minutes.
 */
export async function runIndex(url: URL, env: Env): Promise<Response> {
  const projectId = url.searchParams.get("projectId");
  const versionId = url.searchParams.get("versionId");
  if (!projectId || !versionId) {
    return Response.json(
      { error: "projectId and versionId are required" },
      { status: 400 }
    );
  }

  const logger = createLogger(crypto.randomUUID(), { projectId, versionId });

  const info = await getVersionInfo(env.SPECKLE_TOKEN, projectId, versionId);
  const version = info.version;
  if (!version?.referencedObject) {
    return Response.json(
      { error: "Version not found or has no root object" },
      { status: 404 }
    );
  }
  if (version.schemaVersion != null) {
    return Response.json(
      {
        error: "Unsupported storage generation",
        schemaVersion: version.schemaVersion,
        detail: "This loader reads legacy versions via GET /objects/..."
      },
      { status: 501 }
    );
  }

  const instance = await env.INSPECTION_WORKFLOW.create({
    params: { projectId, versionId }
  });

  logger.info("index_started", {
    instanceId: instance.id,
    rootObjectId: version.referencedObject,
    totalChildrenCount: version.totalChildrenCount
  });

  return Response.json(
    {
      started: true,
      workflowInstanceId: instance.id,
      version: {
        id: version.id,
        model: version.model?.name,
        rootObjectId: version.referencedObject,
        totalChildrenCount: version.totalChildrenCount,
        packfileMB: version.packfileSize
          ? Number(version.packfileSize) / 1_000_000
          : null
      },
      poll: `/debug/query?versionId=${versionId}&op=stats`
    },
    { status: 202 }
  );
}

/** Read-only inspection of an already-indexed version. */
export async function runQuery(url: URL, env: Env): Promise<Response> {
  const versionId = url.searchParams.get("versionId");
  if (!versionId) {
    return Response.json({ error: "versionId is required" }, { status: 400 });
  }

  const agent = await getAgentByName<Env, InspectionAgent>(
    env.InspectionAgent,
    versionId
  );

  switch (url.searchParams.get("op")) {
    case "stats":
      return Response.json({
        stats: await agent.stats(),
        run: await agent.runState(),
        geometryGuard: await agent.assertNoGeometry()
      });
    case "types":
      return Response.json({ types: await agent.listObjectTypes() });
    case "keys":
      return Response.json({
        keys: await agent.listPropertyKeys({
          category: url.searchParams.get("category"),
          minObjects: Number(url.searchParams.get("minObjects") ?? 2),
          limit: Number(url.searchParams.get("limit") ?? 100)
        })
      });
    case "values": {
      const keyPath = url.searchParams.get("keyPath");
      if (!keyPath) {
        return Response.json({ error: "keyPath is required" }, { status: 400 });
      }
      return Response.json({
        values: await agent.distinctValues({
          keyPath,
          category: url.searchParams.get("category"),
          limit: Number(url.searchParams.get("limit") ?? 100)
        })
      });
    }
    case "search": {
      const pattern = url.searchParams.get("pattern");
      if (!pattern) {
        return Response.json({ error: "pattern is required" }, { status: 400 });
      }
      return Response.json({ matches: await agent.searchValues({ pattern }) });
    }
    default:
      return Response.json({ error: "Unknown op" }, { status: 400 });
  }
}
