import {
  SPECKLE_PROJECT_ID,
  SPECKLE_WEBHOOK_PATH,
  VERSION_CREATED_EVENT
} from "./config";
import { createIssue, versionResourceId } from "./client";
import { SIGNATURE_HEADER, verifySignature } from "./signature";
import {
  parseWebhookEnvelope,
  toPublishedVersion,
  type PublishedVersion
} from "./types";

/** True when this request is a Speckle webhook delivery. */
export function isSpeckleWebhookRequest(request: Request): boolean {
  return (
    request.method === "POST" &&
    new URL(request.url).pathname === SPECKLE_WEBHOOK_PATH
  );
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/**
 * Handle one Speckle webhook delivery.
 *
 * Deliveries we do not act on still return 2xx so Speckle does not mark them
 * failed and retry — only genuine faults on our side return 4xx/5xx.
 */
export async function handleSpeckleWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.SPECKLE_WEBHOOK_SECRET || !env.SPECKLE_TOKEN) {
    console.error({
      msg: "speckle webhook not configured",
      hasSecret: Boolean(env.SPECKLE_WEBHOOK_SECRET),
      hasToken: Boolean(env.SPECKLE_TOKEN)
    });
    return json({ error: "Speckle credentials are not configured" }, 500);
  }

  // The signature covers the exact bytes Speckle sent, so hash the raw text.
  const rawBody = await request.text();
  const signatureValid = await verifySignature({
    rawBody,
    signature: request.headers.get(SIGNATURE_HEADER),
    secret: env.SPECKLE_WEBHOOK_SECRET
  });

  if (!signatureValid) {
    console.warn({ msg: "speckle webhook signature rejected" });
    return json({ error: "Invalid signature" }, 401);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return json({ error: "Body is not valid JSON" }, 400);
  }

  const envelope = parseWebhookEnvelope(parsed);
  if (!envelope) {
    return json({ error: "Unrecognised webhook payload" }, 400);
  }

  const { payload } = envelope;
  const eventName = payload.event.event_name;

  if (payload.streamId !== SPECKLE_PROJECT_ID) {
    return json({ ignored: "project", projectId: payload.streamId });
  }

  if (eventName !== VERSION_CREATED_EVENT) {
    return json({ ignored: "event", event: eventName });
  }

  const version = toPublishedVersion(payload);
  if (!version) {
    console.warn({ msg: "version_create payload missing fields", eventName });
    return json({ ignored: "payload", event: eventName });
  }

  console.log({
    msg: "speckle version published",
    projectId: version.projectId,
    modelId: version.modelId,
    versionId: version.versionId
  });

  try {
    const issue = await createIssue(env.SPECKLE_TOKEN, {
      projectId: version.projectId,
      title: "hello world",
      description: helloWorldDescription(version),
      resourceIdString: versionResourceId(version.modelId, version.versionId)
    });

    console.log({
      msg: "speckle issue created",
      issueId: issue.id,
      identifier: issue.identifier,
      versionId: version.versionId
    });

    return json({ created: issue.identifier, issueId: issue.id }, 201);
  } catch (error) {
    console.error({
      msg: "speckle issue creation failed",
      versionId: version.versionId,
      error: error instanceof Error ? error.message : String(error)
    });
    return json({ error: "Failed to create Speckle issue" }, 502);
  }
}

/** Placeholder body — proves the pipeline end to end before Scout does real work. */
function helloWorldDescription(version: PublishedVersion): string {
  const from = version.sourceApplication ?? "unknown source";
  const by = version.authorName ?? "unknown author";
  return `hello world — new version ${version.versionId} on model ${version.modelName} (published from ${from} by ${by}).`;
}
