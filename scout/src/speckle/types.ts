/**
 * Shape of the webhook body Speckle POSTs to us.
 *
 * Speckle wraps everything in a top-level `payload` key and signs the
 * serialized envelope with HMAC-SHA256 in the `X-WEBHOOK-SIGNATURE` header.
 * Only the fields Scout relies on are typed strictly; the rest are loose
 * because Speckle adds to them over time.
 */
export type SpeckleWebhookEnvelope = {
  payload: SpeckleWebhookPayload;
};

export type SpeckleWebhookPayload = {
  /** Project id (Speckle still calls it `streamId` on the wire). */
  streamId: string;
  userId: string | null;
  activityMessage?: string | null;
  event: {
    /** e.g. `commit_create` — see VERSION_CREATED_EVENT. */
    event_name: string;
    data: unknown;
  };
  server?: { canonicalUrl?: string; name?: string };
  stream?: { id: string; name?: string };
  user?: { id: string; name?: string };
  webhook?: { id: string; triggers?: string[] };
};

/**
 * `event.data` for a `commit_create` event, as Speckle builds it in
 * `addCommitCreatedActivity`. Every field beyond the ids is best-effort — which
 * keys actually arrive depends on the publish path, so `toPublishedVersion`
 * reads defensively rather than trusting this shape.
 */
export type VersionCreatedData = {
  /** Version id (usually the same value as `commit.versionId`). */
  id?: string;
  commit?: {
    versionId?: string;
    projectId?: string;
    modelId?: string;
    branchName?: string;
    objectId?: string;
    message?: string | null;
    sourceApplication?: string | null;
    totalChildrenCount?: number | null;
    parents?: string[] | null;
  };
};

/** Narrowed, flat view of a version-published event. */
export type PublishedVersion = {
  projectId: string;
  /** Absent on some publish paths — the issue is then not pinned to a model. */
  modelId: string | null;
  versionId: string;
  modelName: string | null;
  objectId: string | null;
  message: string | null;
  sourceApplication: string | null;
  authorName: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Parse an unknown request body into a webhook envelope, or `null` if malformed. */
export function parseWebhookEnvelope(
  body: unknown
): SpeckleWebhookEnvelope | null {
  if (!isRecord(body) || !isRecord(body.payload)) return null;
  const payload = body.payload;
  if (typeof payload.streamId !== "string") return null;
  if (
    !isRecord(payload.event) ||
    typeof payload.event.event_name !== "string"
  ) {
    return null;
  }
  return body as SpeckleWebhookEnvelope;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** First non-empty string found under any of `keys`. */
function pick(
  sources: Record<string, unknown>[],
  ...keys: string[]
): string | null {
  for (const source of sources) {
    for (const key of keys) {
      const value = str(source[key]);
      if (value) return value;
    }
  }
  return null;
}

/**
 * Pull the version details out of a `commit_create` payload.
 *
 * Speckle builds `event.data.commit` by spreading the mutation input over a few
 * derived ids, and the exact keys differ by publish path (connector, file
 * upload, legacy `commitCreate`). So read tolerantly across the shapes rather
 * than pinning to one: only the version id is genuinely required — everything
 * else degrades to `null`, and an issue can still be created without it.
 */
export function toPublishedVersion(
  payload: SpeckleWebhookPayload
): PublishedVersion | null {
  const data = payload.event.data;
  if (!isRecord(data)) return null;

  // Candidate carriers, most specific first.
  const sources = [
    isRecord(data.commit) ? data.commit : null,
    isRecord(data.version) ? data.version : null,
    data
  ].filter((s): s is Record<string, unknown> => s !== null);

  const versionId = pick(sources, "versionId", "commitId", "id");
  if (!versionId) return null;

  return {
    projectId: payload.streamId,
    modelId: pick(sources, "modelId", "branchId"),
    versionId,
    modelName: pick(sources, "branchName", "modelName"),
    // `Version` records call this `referencedObject`; inputs call it `objectId`.
    objectId: pick(sources, "objectId", "referencedObject"),
    message: pick(sources, "message"),
    sourceApplication: pick(sources, "sourceApplication"),
    authorName: str(payload.user?.name)
  };
}

/**
 * Compact description of `event.data` for diagnostics, so an unexpected payload
 * shape can be identified from the logs without dumping the whole delivery.
 */
export function describeEventData(payload: SpeckleWebhookPayload): string {
  const data = payload.event.data;
  if (!isRecord(data)) return `non-object: ${typeof data}`;
  const parts = [`data keys: ${Object.keys(data).join(",")}`];
  for (const key of ["commit", "version"]) {
    const nested = data[key];
    if (isRecord(nested))
      parts.push(`${key} keys: ${Object.keys(nested).join(",")}`);
  }
  return parts.join(" | ");
}
