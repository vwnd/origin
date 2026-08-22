/**
 * Speckle integration configuration.
 *
 * Only non-secret values belong here. Credentials (`SPECKLE_TOKEN`,
 * `SPECKLE_WEBHOOK_SECRET`) are Worker secrets — see `.dev.vars.example`.
 */

/**
 * The one Speckle project Scout reacts to. Webhook deliveries for any other
 * project are acknowledged and ignored.
 */
export const SPECKLE_PROJECT_ID = "REPLACE_WITH_PROJECT_ID";

/** Speckle server hosting the project above. Change for self-hosted instances. */
export const SPECKLE_SERVER_URL = "https://app.speckle.systems";

/** Path the Speckle webhook posts to. Configure this in Project → Settings → Webhooks. */
export const SPECKLE_WEBHOOK_PATH = "/webhooks/speckle";

/**
 * Speckle's internal event name for "a new version was published to a model".
 * The web UI displays this trigger as `version_create`.
 */
export const VERSION_CREATED_EVENT = "commit_create";
