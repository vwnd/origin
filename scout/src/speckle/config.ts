/**
 * Speckle integration configuration.
 *
 * Only non-secret values belong here. Credentials (`SPECKLE_TOKEN`,
 * `SPECKLE_WEBHOOK_SECRET`) are Worker secrets — see `.dev.vars.example`.
 */

/**
 * Speckle server hosting the project. Change for self-hosted instances.
 *
 * There is no project-id constant: a Speckle webhook is created inside one
 * project and only ever fires for that project, so `payload.streamId` on each
 * delivery is the project to act on.
 */
export const SPECKLE_SERVER_URL = "https://app.speckle.systems";

/**
 * The project the UI reads from.
 *
 * The webhook is project-scoped so the pipeline never needs this — it acts on
 * whatever `payload.streamId` names. The UI does need a project to show, and
 * this is it.
 */
export const SPECKLE_PROJECT_ID = "98e7569906";

/** Path the Speckle webhook posts to. Configure this in Project → Settings → Webhooks. */
export const SPECKLE_WEBHOOK_PATH = "/webhooks/speckle";

/**
 * Speckle's internal event name for "a new version was published to a model".
 * The web UI displays this trigger as `version_create`.
 */
export const VERSION_CREATED_EVENT = "commit_create";
