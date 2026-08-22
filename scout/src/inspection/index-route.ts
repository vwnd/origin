import { getAgentByName } from "agents";
import { loadEnabledInstructions } from "../instructions";
import { runInstruction } from "./inspect";
import {
  extractFingerprints,
  fingerprint,
  renderSummaryIssue,
  sortFindings,
  type Finding
} from "./findings";
import { createIssue, listOpenIssues, versionUrl } from "../speckle/client";
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
    case "candidates": {
      const candidates = await agent.listCandidateParameters();
      const histograms = await agent.histogramsFor(
        candidates.map((candidate) => candidate.keyPath)
      );
      // Rough token estimate so a run's cost can be predicted before paying
      // for it: ~4 chars per token over the rendered histograms.
      const promptChars = candidates.reduce((total, candidate) => {
        const values = histograms[candidate.keyPath] ?? [];
        return (
          total +
          candidate.keyPath.length +
          values.reduce((sum, v) => sum + String(v.value).length + 8, 0)
        );
      }, 0);
      return Response.json({
        count: candidates.length,
        estimatedVariableTokens: Math.round(promptChars / 4),
        candidates: candidates.slice(0, 40).map((candidate) => ({
          ...candidate,
          topValues: (histograms[candidate.keyPath] ?? [])
            .slice(0, 4)
            .map((v) => `${v.count}x ${v.value}`)
        }))
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

/**
 * Stage B driver: run the instruction set against an already-indexed version
 * and return the findings without filing anything.
 */
export async function runInspect(url: URL, env: Env): Promise<Response> {
  const versionId = url.searchParams.get("versionId");
  if (!versionId) {
    return Response.json({ error: "versionId is required" }, { status: 400 });
  }
  if (!env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const logger = createLogger(crypto.randomUUID(), { versionId });
  const agent = await getAgentByName<Env, InspectionAgent>(
    env.InspectionAgent,
    versionId
  );

  const stats = await agent.stats();
  if (stats.objects === 0) {
    return Response.json(
      { error: "Version is not indexed yet", stats },
      { status: 409 }
    );
  }

  const only = url.searchParams.get("instruction");
  const instructions = loadEnabledInstructions().filter(
    (item) => !only || item.id === only
  );
  if (instructions.length === 0) {
    return Response.json({ error: "No matching instruction" }, { status: 404 });
  }

  const results = [];
  for (const instruction of instructions) {
    results.push(
      await runInstruction({
        apiKey: env.ANTHROPIC_API_KEY,
        instruction,
        agent,
        modelName: null,
        logger,
        maxCandidates: url.searchParams.get("maxCandidates")
          ? Number(url.searchParams.get("maxCandidates"))
          : undefined
      })
    );
  }

  const findings = sortFindings(results.flatMap((result) => result.findings));
  const fingerprinted = await Promise.all(
    findings.map(async (finding) => ({
      fingerprint: await fingerprint(finding),
      ...finding
    }))
  );

  // Surface a systemic failure as a failure. A 200 with zero findings is
  // indistinguishable from a clean model, which is the worst way to be wrong.
  const allFailed = results.every(
    (result) => result.stoppedBecause === "failed"
  );

  return Response.json(
    {
      ok: !allFailed,
      stats,
      runs: results.map((result) => ({
        instructionId: result.instructionId,
        candidates: result.candidates,
        judged: result.judged,
        failed: result.failed,
        stoppedBecause: result.stoppedBecause,
        error: result.error,
        findings: result.findings.length,
        usage: result.usage
      })),
      findings: fingerprinted
    },
    { status: allFailed ? 502 : 200 }
  );
}

/**
 * Files a summary issue from findings supplied in the request body, exercising
 * the real render -> fingerprint -> dedupe -> createIssue path.
 *
 * Exists so the Speckle side can be verified independently of the model: the
 * inspection and the filing fail for completely different reasons, and mixing
 * them makes both harder to diagnose.
 */
export async function runFileIssue(
  request: Request,
  url: URL,
  env: Env
): Promise<Response> {
  const projectId = url.searchParams.get("projectId");
  const versionId = url.searchParams.get("versionId");
  if (!projectId || !versionId) {
    return Response.json(
      { error: "projectId and versionId are required" },
      { status: 400 }
    );
  }

  const logger = createLogger(crypto.randomUUID(), { projectId, versionId });
  const body = (await request.json()) as { findings?: Finding[] };
  const findings = sortFindings(body.findings ?? []);
  if (findings.length === 0) {
    return Response.json({ error: "No findings supplied" }, { status: 400 });
  }

  const withPrints = await Promise.all(
    findings.map(async (finding) => ({
      finding,
      print: await fingerprint(finding)
    }))
  );

  const open = await listOpenIssues(env.SPECKLE_TOKEN, projectId);
  const seen = extractFingerprints(open.map((issue) => issue.rawDescription));
  const fresh = withPrints.filter((entry) => !seen.has(entry.print));

  logger.info("dedupe_complete", {
    found: withPrints.length,
    alreadyOpen: withPrints.length - fresh.length,
    novel: fresh.length,
    openIssuesScanned: open.length
  });

  if (fresh.length === 0) {
    return Response.json({
      outcome: "no_new_findings",
      supplied: findings.length,
      alreadyOpen: withPrints.length,
      openIssuesScanned: open.length
    });
  }

  const info = await getVersionInfo(env.SPECKLE_TOKEN, projectId, versionId);
  const modelId = info.version?.model?.id ?? null;
  const rendered = renderSummaryIssue({
    findings: fresh.map((entry) => entry.finding),
    fingerprints: fresh.map((entry) => entry.print),
    versionId,
    modelName: info.version?.model?.name ?? null
  });
  const link = modelId
    ? `

${versionUrl(projectId, modelId, versionId)}`
    : "";

  const created = await createIssue(env.SPECKLE_TOKEN, {
    projectId,
    title: rendered.title,
    description: rendered.description + link
  });

  logger.info("issue_created", {
    issue: created.identifier,
    findings: fresh.length
  });

  return Response.json({
    outcome: "issue_created",
    issue: created,
    filed: fresh.length,
    suppressed: withPrints.length - fresh.length,
    openIssuesScanned: open.length,
    title: rendered.title,
    description: rendered.description
  });
}
