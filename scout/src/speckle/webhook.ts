import { SPECKLE_WEBHOOK_PATH, VERSION_CREATED_EVENT } from "./config";
import { createIssue, versionUrl } from "./client";
import { SIGNATURE_HEADER, verifySignature } from "./signature";
import {
  describeEventData,
  parseWebhookEnvelope,
  toPublishedVersion,
  type PublishedVersion
} from "./types";
import { recordDelivery, type DeliveryMetrics } from "./analytics";
import { createLogger, errorMessage, type Logger } from "./logging";

/** True when this request is a Speckle webhook delivery. */
export function isSpeckleWebhookRequest(request: Request): boolean {
  return (
    request.method === "POST" &&
    new URL(request.url).pathname === SPECKLE_WEBHOOK_PATH
  );
}

/** What `processDelivery` decided, before it becomes a Response. */
type DeliveryResult = {
  status: number;
  body: Record<string, unknown>;
} & Omit<DeliveryMetrics, "durationMs" | "status">;

/**
 * Handle one Speckle webhook delivery.
 *
 * Every exit path funnels through `recordDelivery`, so no outcome can slip past
 * the logs or the analytics dataset.
 */
export async function handleSpeckleWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const startedAt = Date.now();
  const logger = createLogger(crypto.randomUUID(), {
    version: env.CF_VERSION_METADATA?.tag || env.CF_VERSION_METADATA?.id
  });

  logger.info("delivery_received", {
    hasSignature: request.headers.has(SIGNATURE_HEADER),
    contentLength: request.headers.get("content-length")
  });

  let result: DeliveryResult;
  try {
    result = await processDelivery(request, env, logger);
  } catch (error) {
    // Unexpected fault — still measured, so it cannot hide.
    logger.error("delivery_unhandled_error", { error: errorMessage(error) });
    result = {
      status: 500,
      body: { error: "Internal error" },
      outcome: "speckle_error",
      error: errorMessage(error)
    };
  }

  recordDelivery(env, logger, {
    ...result,
    status: result.status,
    durationMs: Date.now() - startedAt
  });

  return Response.json(
    { ...result.body, deliveryId: logger.deliveryId },
    { status: result.status }
  );
}

/**
 * Deliveries we do not act on still resolve to 2xx so Speckle does not mark
 * them failed and retry — only genuine faults resolve to 4xx/5xx.
 */
async function processDelivery(
  request: Request,
  env: Env,
  logger: Logger
): Promise<DeliveryResult> {
  if (!env.SPECKLE_WEBHOOK_SECRET || !env.SPECKLE_TOKEN) {
    logger.error("not_configured", {
      hasSecret: Boolean(env.SPECKLE_WEBHOOK_SECRET),
      hasToken: Boolean(env.SPECKLE_TOKEN)
    });
    return {
      status: 500,
      body: { error: "Speckle credentials are not configured" },
      outcome: "not_configured"
    };
  }

  // The signature covers the exact bytes Speckle sent, so hash the raw text.
  const rawBody = await request.text();
  const signatureValid = await verifySignature({
    rawBody,
    signature: request.headers.get(SIGNATURE_HEADER),
    secret: env.SPECKLE_WEBHOOK_SECRET
  });

  if (!signatureValid) {
    logger.warn("signature_rejected", { bodyBytes: rawBody.length });
    return {
      status: 401,
      body: { error: "Invalid signature" },
      outcome: "bad_signature"
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    logger.warn("body_not_json", { bodyBytes: rawBody.length });
    return {
      status: 400,
      body: { error: "Body is not valid JSON" },
      outcome: "bad_request",
      error: "invalid json"
    };
  }

  const envelope = parseWebhookEnvelope(parsed);
  if (!envelope) {
    logger.warn("payload_unrecognised");
    return {
      status: 400,
      body: { error: "Unrecognised webhook payload" },
      outcome: "bad_request",
      error: "unrecognised payload"
    };
  }

  const { payload } = envelope;
  const eventName = payload.event.event_name;

  // No project filter: the webhook lives inside one Speckle project, so every
  // delivery already belongs to the project named by `payload.streamId`.
  if (eventName !== VERSION_CREATED_EVENT) {
    logger.info("ignored_event", { eventName });
    return {
      status: 200,
      body: { ignored: "event", event: eventName },
      outcome: "ignored_event",
      eventName,
      projectId: payload.streamId
    };
  }

  const version = toPublishedVersion(payload);
  if (!version) {
    // Log the shape, not the contents, so an unexpected payload can be
    // diagnosed from the logs alone.
    logger.warn("payload_missing_fields", {
      eventName,
      dataShape: describeEventData(payload)
    });
    return {
      status: 200,
      body: { ignored: "payload", event: eventName },
      outcome: "ignored_payload",
      eventName,
      projectId: payload.streamId,
      error: "version fields missing"
    };
  }

  logger.info("version_published", {
    eventName,
    projectId: version.projectId,
    modelId: version.modelId,
    modelName: version.modelName,
    versionId: version.versionId,
    sourceApplication: version.sourceApplication,
    // Surfaced once so a shape change shows up even on the success path.
    dataShape: describeEventData(payload)
  });

  const versionFields = {
    eventName,
    projectId: version.projectId,
    modelId: version.modelId,
    versionId: version.versionId,
    sourceApplication: version.sourceApplication
  };

  try {
    const issue = await createIssue(env.SPECKLE_TOKEN, {
      projectId: version.projectId,
      title: "hello world",
      description: helloWorldDescription(version)
      // No `anchor`: pinning an issue to the version needs a viewerState and a
      // screenshot alongside the resource id, and we have neither here. The
      // description carries a link to the version instead.
    });

    logger.info("issue_created", {
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      issueNumber: issue.number
    });

    return {
      status: 201,
      body: { created: issue.identifier, issueId: issue.id },
      outcome: "issue_created",
      issueIdentifier: issue.identifier,
      ...versionFields
    };
  } catch (error) {
    logger.error("issue_creation_failed", { error: errorMessage(error) });
    return {
      status: 502,
      body: { error: "Failed to create Speckle issue" },
      outcome: "speckle_error",
      error: errorMessage(error),
      ...versionFields
    };
  }
}

/** Placeholder body — proves the pipeline end to end before Scout does real work. */
function helloWorldDescription(version: PublishedVersion): string {
  const from = version.sourceApplication ?? "unknown source";
  const by = version.authorName ?? "unknown author";
  const model = version.modelName ?? version.modelId ?? "unknown model";
  const link = version.modelId
    ? ` ${versionUrl(version.projectId, version.modelId, version.versionId)}`
    : "";
  return `hello world — new version ${version.versionId} on model ${model} (published from ${from} by ${by}).${link}`;
}
