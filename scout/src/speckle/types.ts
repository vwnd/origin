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

/** `event.data` for a `commit_create` event. */
export type VersionCreatedData = {
  /** Version id (same value as `commit.versionId`). */
  id: string;
  commit: {
    versionId: string;
    projectId: string;
    modelId: string;
    branchName: string;
    objectId: string;
    message?: string | null;
    sourceApplication?: string | null;
    totalChildrenCount?: number | null;
    parents?: string[] | null;
  };
};

/** Narrowed, flat view of a version-published event. */
export type PublishedVersion = {
  projectId: string;
  modelId: string;
  versionId: string;
  modelName: string;
  objectId: string;
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

/**
 * Pull the version details out of a `commit_create` payload.
 * Returns `null` if the payload does not carry the fields we need.
 */
export function toPublishedVersion(
  payload: SpeckleWebhookPayload
): PublishedVersion | null {
  const data = payload.event.data;
  if (!isRecord(data) || !isRecord(data.commit)) return null;

  const commit = data.commit as Partial<VersionCreatedData["commit"]>;
  const versionId =
    commit.versionId ?? (typeof data.id === "string" ? data.id : undefined);

  if (!versionId || !commit.modelId || !commit.objectId) return null;

  return {
    projectId: payload.streamId,
    modelId: commit.modelId,
    versionId,
    modelName: commit.branchName ?? "unknown",
    objectId: commit.objectId,
    message: commit.message ?? null,
    sourceApplication: commit.sourceApplication ?? null,
    authorName: payload.user?.name ?? null
  };
}
