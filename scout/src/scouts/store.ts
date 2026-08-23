import { parameterConsistency } from "../instructions/parameter-consistency";
import type { Instruction } from "../instructions/types";

/**
 * Scouts — the instruction set, stored so it can be edited without a redeploy.
 *
 * The markdown body lives in R2 (`scouts/<id>.md`) and its metadata in D1. The
 * split matters: listing the scouts for the UI is a single indexed D1 query,
 * while bodies — which are large and only needed one at a time — stay out of
 * that path.
 *
 * On an empty store the bundled instruction is seeded in, so a fresh deploy
 * still inspects something and the code stays the source of the default.
 */

export type ScoutMeta = {
  id: string;
  title: string;
  description: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Scout = ScoutMeta & { body: string };

const BODY_PREFIX = "scouts/";
/** Guards against a paste of an entire document becoming an instruction. */
const MAX_BODY_BYTES = 256 * 1024;

function bodyKey(id: string): string {
  return `${BODY_PREFIX}${id}.md`;
}

/**
 * Ids appear in an R2 key and in a finding's fingerprint, so they are
 * constrained rather than taken verbatim from user input.
 */
export function normaliseId(raw: string): string {
  const id = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!id)
    throw new Error("Scout id must contain at least one letter or digit");
  return id;
}

function rowToMeta(row: Record<string, unknown>): ScoutMeta {
  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description === null ? null : String(row.description),
    enabled: Number(row.enabled) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

/**
 * Seed the bundled instruction on first use.
 *
 * Idempotent, and only ever runs when the table is empty — an operator who
 * deletes every scout has done that deliberately and should not have one
 * reappear, so the check is "never seeded" rather than "none enabled".
 */
async function seedIfEmpty(env: Env): Promise<void> {
  const existing = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM scouts"
  ).first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) return;

  const now = new Date().toISOString();
  await env.INSTRUCTIONS.put(
    bodyKey(parameterConsistency.id),
    parameterConsistency.body
  );
  await env.DB.prepare(
    "INSERT OR IGNORE INTO scouts (id, title, description, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(
      parameterConsistency.id,
      parameterConsistency.title,
      "Finds misspellings, notation drift and unit inconsistency in editable parameter values.",
      1,
      now,
      now
    )
    .run();
}

export async function listScouts(env: Env): Promise<ScoutMeta[]> {
  await seedIfEmpty(env);
  const { results } = await env.DB.prepare(
    "SELECT * FROM scouts ORDER BY updated_at DESC"
  ).all();
  return (results ?? []).map((row) =>
    rowToMeta(row as Record<string, unknown>)
  );
}

export async function getScout(env: Env, id: string): Promise<Scout | null> {
  const row = await env.DB.prepare("SELECT * FROM scouts WHERE id = ?")
    .bind(id)
    .first();
  if (!row) return null;

  const object = await env.INSTRUCTIONS.get(bodyKey(id));
  const body = object ? await object.text() : "";
  return { ...rowToMeta(row as Record<string, unknown>), body };
}

export async function saveScout(
  env: Env,
  input: {
    id: string;
    title: string;
    description?: string | null;
    enabled?: boolean;
    body: string;
  }
): Promise<Scout> {
  const id = normaliseId(input.id);
  const body = input.body ?? "";
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    throw new Error("Scout body is too large");
  }
  if (!input.title.trim()) throw new Error("Scout title is required");

  const now = new Date().toISOString();
  const existing = await env.DB.prepare(
    "SELECT created_at FROM scouts WHERE id = ?"
  )
    .bind(id)
    .first<{ created_at: string }>();

  // Body first: a metadata row pointing at a missing body would make the scout
  // silently inspect nothing, which is worse than a failed save.
  await env.INSTRUCTIONS.put(bodyKey(id), body);

  await env.DB.prepare(
    `INSERT INTO scouts (id, title, description, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       enabled = excluded.enabled,
       updated_at = excluded.updated_at`
  )
    .bind(
      id,
      input.title.trim(),
      input.description?.trim() || null,
      input.enabled === false ? 0 : 1,
      existing?.created_at ?? now,
      now
    )
    .run();

  const saved = await getScout(env, id);
  if (!saved) throw new Error("Scout disappeared immediately after saving");
  return saved;
}

export async function deleteScout(env: Env, id: string): Promise<boolean> {
  const result = await env.DB.prepare("DELETE FROM scouts WHERE id = ?")
    .bind(id)
    .run();
  await env.INSTRUCTIONS.delete(bodyKey(id));
  return (result.meta.changes ?? 0) > 0;
}

/**
 * The enabled scouts, as the inspection pipeline consumes them.
 *
 * Bodies are fetched in parallel; a scout whose body is missing or empty is
 * skipped rather than sent to the model, since an empty instruction would
 * produce confident findings against no criteria at all.
 */
export async function loadEnabledScouts(env: Env): Promise<Instruction[]> {
  const metas = (await listScouts(env)).filter((meta) => meta.enabled);

  const loaded = await Promise.all(
    metas.map(async (meta): Promise<Instruction | null> => {
      const object = await env.INSTRUCTIONS.get(bodyKey(meta.id));
      const body = object ? await object.text() : "";
      if (!body.trim()) return null;
      return {
        id: meta.id,
        title: meta.title,
        enabled: true,
        body
      } satisfies Instruction;
    })
  );

  return loaded.filter((item): item is Instruction => item !== null);
}
