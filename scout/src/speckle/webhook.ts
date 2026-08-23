import {
  ISSUE_CREATED_EVENT,
  SPECKLE_WEBHOOK_PATH,
  VERSION_CREATED_EVENT
} from "./config";
import { SIGNATURE_HEADER, verifySignature } from "./signature";
import {
  describeEventData,
  parseWebhookEnvelope,
  toNotifiedIssue,
  toPublishedVersion
} from "./types";
import { recordDelivery, type DeliveryMetrics } from "./analytics";
import { publishEvent } from "../api/events";
import { recordRunStarted } from "../api/runs";
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

  // Any issue landing on the project — Scout's own or someone else's — should
  // wake up the Inbox live rather than wait for a page reload.
  if (eventName === ISSUE_CREATED_EVENT) {
    const issue = toNotifiedIssue(payload);
    logger.info("issue_synced", issue);
    await publishEvent(env, {
      type: "issue_synced",
      ...issue,
      at: new Date().toISOString()
    });
    return {
      status: 200,
      body: { synced: true },
      outcome: "issue_synced",
      eventName,
      projectId: issue.projectId,
      issueIdentifier: issue.identifier
    };
  }

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

  // Hand off to the durable pipeline and acknowledge immediately. Indexing a
  // version takes minutes, which is far longer than Speckle will wait — and it
  // retries anything that is not 2xx, so the slow path must not sit in the
  // request.
  try {
    const instance = await env.INSPECTION_WORKFLOW.create({
      params: { projectId: version.projectId, versionId: version.versionId }
    });

    logger.info("inspection_started", {
      instanceId: instance.id,
      ...versionFields
    });

    await recordRunStarted(env, {
      instanceId: instance.id,
      projectId: version.projectId,
      versionId: version.versionId,
      modelName: version.modelName
    });
    await publishEvent(env, {
      type: "version_published",
      projectId: version.projectId,
      versionId: version.versionId,
      modelName: version.modelName,
      instanceId: instance.id,
      at: new Date().toISOString()
    });

    return {
      status: 202,
      body: { started: true, workflowInstanceId: instance.id },
      outcome: "run_started",
      ...versionFields
    };
  } catch (error) {
    logger.error("inspection_start_failed", { error: errorMessage(error) });
    return {
      status: 502,
      body: { error: "Failed to start inspection" },
      outcome: "run_failed",
      error: errorMessage(error),
      ...versionFields
    };
  }
}
