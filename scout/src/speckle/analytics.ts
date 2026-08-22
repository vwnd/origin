/**
 * Custom metrics for the Speckle webhook pipeline, written to Workers
 * Analytics Engine (dataset `scout_speckle_deliveries`).
 *
 * One data point per webhook delivery, whatever the result — so success rate,
 * latency, and rejection reasons are all queryable. See the README for SQL.
 */

import type { Logger } from "./logging";

/**
 * Terminal state of a delivery. Indexed, so it is cheap to group by and it is
 * the sampling key when volume gets high.
 */
export type DeliveryOutcome =
  | "issue_created" // matched and an issue was created
  | "not_configured" // missing token or webhook secret
  | "bad_signature" // HMAC did not verify
  | "bad_request" // unparseable body or payload
  | "ignored_event" // event we do not act on
  | "ignored_payload" // right event, but missing fields we need
  | "speckle_error" // Speckle rejected the request
  | "run_started" // inspection pipeline handed off to the workflow
  | "run_failed"; // could not start the pipeline

export type DeliveryMetrics = {
  outcome: DeliveryOutcome;
  status: number;
  durationMs: number;
  eventName?: string | null;
  projectId?: string | null;
  modelId?: string | null;
  versionId?: string | null;
  sourceApplication?: string | null;
  issueIdentifier?: string | null;
  error?: string | null;
};

/** Blob slots are positional — `blob1`..`blob9` in SQL. Order must stay stable. */
function blobs(
  metrics: DeliveryMetrics,
  deliveryId: string,
  versionTag: string
): (string | null)[] {
  return [
    metrics.outcome, // blob1
    metrics.eventName ?? null, // blob2
    metrics.projectId ?? null, // blob3
    metrics.modelId ?? null, // blob4
    metrics.versionId ?? null, // blob5
    metrics.sourceApplication ?? null, // blob6
    metrics.issueIdentifier ?? null, // blob7
    metrics.error?.slice(0, 512) ?? null, // blob8
    deliveryId, // blob9
    versionTag // blob10
  ];
}

/**
 * Record one delivery.
 *
 * `writeDataPoint` is non-blocking and returns void — deliberately not awaited.
 * The binding is unavailable in local dev, so this no-ops there rather than
 * throwing.
 */
export function recordDelivery(
  env: Env,
  logger: Logger,
  metrics: DeliveryMetrics
): void {
  logger.info("delivery_complete", {
    outcome: metrics.outcome,
    status: metrics.status,
    durationMs: metrics.durationMs,
    eventName: metrics.eventName ?? undefined,
    versionId: metrics.versionId ?? undefined,
    issueIdentifier: metrics.issueIdentifier ?? undefined,
    error: metrics.error ?? undefined
  });

  if (!env.SCOUT_ANALYTICS) return;

  // `tag` is only populated for versioned uploads and comes back as "" from a
  // plain `wrangler deploy`, so fall back to the always-present version id.
  const versionTag =
    env.CF_VERSION_METADATA?.tag || env.CF_VERSION_METADATA?.id || "unknown";

  env.SCOUT_ANALYTICS.writeDataPoint({
    // Exactly one index — the outcome, so grouping by result is cheap.
    indexes: [metrics.outcome],
    blobs: blobs(metrics, logger.deliveryId, versionTag),
    doubles: [
      metrics.status, // double1
      metrics.durationMs, // double2
      metrics.outcome === "issue_created" ? 1 : 0 // double3 — success flag
    ]
  });
}
