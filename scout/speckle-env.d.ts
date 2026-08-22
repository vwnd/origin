/**
 * Secrets used by the Speckle integration. Declared here (rather than in the
 * generated `env.d.ts`) so `wrangler types` can be re-run without losing them.
 *
 * Set locally in `.dev.vars`, and in production with:
 *   wrangler secret put SPECKLE_TOKEN
 *   wrangler secret put SPECKLE_WEBHOOK_SECRET
 */
interface Env {
  /** Speckle Personal Access Token. Needs the `streams:write` scope. */
  SPECKLE_TOKEN: string;
  /** Shared secret configured on the Speckle project webhook. */
  SPECKLE_WEBHOOK_SECRET: string;
}
