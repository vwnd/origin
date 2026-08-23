import { deleteScout, getScout, listScouts, saveScout } from "../scouts/store";
import { listProjectIssues, getWorkspaceId } from "../speckle/client";
import { SPECKLE_PROJECT_ID } from "../speckle/config";
import { createLogger, errorMessage } from "../speckle/logging";
import { timingSafeEqualStrings } from "../speckle/signature";
import { listRuns, listScoutRuns } from "./runs";

/**
 * JSON API behind the UI.
 *
 * Speckle is proxied rather than called from the browser: the PAT is a Worker
 * secret and must not reach the client. That also keeps the project id and
 * query shapes in one place.
 */

const API_PREFIX = "/api/";

export function isApiRequest(request: Request): boolean {
  return new URL(request.url).pathname.startsWith(API_PREFIX);
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" }
  });
}

/**
 * Whether writing a scout requires a token.
 *
 * Off for the demo. It is a real gate when on: a scout body is a prompt, so
 * whoever can write one decides what the inspector looks for and what lands as
 * an issue on a real project — not something to leave anonymous on a public URL
 * beyond a demo. Put Cloudflare Access in front, or flip this back to `true`
 * and set `SCOUT_ADMIN_TOKEN`, before this points at anything that matters.
 */
const REQUIRE_WRITE_TOKEN = false;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

async function isAuthorisedWrite(request: Request, env: Env): Promise<boolean> {
  if (!REQUIRE_WRITE_TOKEN) return true;

  const expected = env.SCOUT_ADMIN_TOKEN || env.SCOUT_DEBUG_TOKEN;
  if (!expected) return false;

  // Cloudflare Access, when configured, authenticates ahead of the Worker.
  if (request.headers.get("cf-access-jwt-assertion")) return true;

  const presented = request.headers.get("x-scout-token");
  if (!presented) return false;
  return await timingSafeEqualStrings(presented, expected);
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname.slice(API_PREFIX.length);
  const logger = createLogger(crypto.randomUUID(), { route });

  if (
    MUTATING_METHODS.has(request.method) &&
    !(await isAuthorisedWrite(request, env))
  ) {
    logger.warn("api_write_unauthorised", { method: request.method });
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    // ---- scouts -------------------------------------------------------
    if (route === "scouts") {
      if (request.method === "GET") {
        return json({ scouts: await listScouts(env) });
      }
      if (request.method === "POST") {
        const input = (await request.json()) as Parameters<typeof saveScout>[1];
        const saved = await saveScout(env, input);
        logger.info("scout_saved", { id: saved.id });
        return json({ scout: saved }, 201);
      }
      return json({ error: "Method not allowed" }, 405);
    }

    if (route.startsWith("scouts/")) {
      const id = decodeURIComponent(route.slice("scouts/".length));
      if (request.method === "GET") {
        const scout = await getScout(env, id);
        return scout ? json({ scout }) : json({ error: "Not found" }, 404);
      }
      if (request.method === "PUT") {
        const input = (await request.json()) as Omit<
          Parameters<typeof saveScout>[1],
          "id"
        >;
        const saved = await saveScout(env, { ...input, id });
        logger.info("scout_saved", { id: saved.id });
        return json({ scout: saved });
      }
      if (request.method === "DELETE") {
        const removed = await deleteScout(env, id);
        logger.info("scout_deleted", { id, removed });
        return removed
          ? json({ deleted: id })
          : json({ error: "Not found" }, 404);
      }
      return json({ error: "Method not allowed" }, 405);
    }

    // ---- issues (proxied from Speckle) --------------------------------
    if (route === "issues") {
      const issues = await listProjectIssues(
        env.SPECKLE_TOKEN,
        SPECKLE_PROJECT_ID,
        Number(url.searchParams.get("limit") ?? 50)
      );
      return json({
        projectId: SPECKLE_PROJECT_ID,
        workspaceId: await getWorkspaceId(
          env.SPECKLE_TOKEN,
          SPECKLE_PROJECT_ID
        ),
        issues
      });
    }

    // ---- workflow runs ------------------------------------------------
    if (route === "runs") {
      const runs = await listRuns(
        env,
        Number(url.searchParams.get("limit") ?? 50)
      );
      // The fleet runs in parallel, so each run carries its per-scout rows —
      // that is where "which scout is still judging?" is answered.
      const scouts = await listScoutRuns(
        env,
        runs.map((run) => run.instanceId)
      );
      return json({
        runs: runs.map((run) => ({
          ...run,
          scouts: scouts.get(run.instanceId) ?? []
        }))
      });
    }

    return json({ error: "Unknown route" }, 404);
  } catch (error) {
    logger.error("api_failed", { error: errorMessage(error) });
    return json({ error: errorMessage(error) }, 500);
  }
}
