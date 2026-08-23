/**
 * Run history for the Analytics page.
 *
 * Kept in D1 rather than read back from the Workflows binding: instance state
 * expires, the binding can only be asked about ids you already hold, and the
 * page needs the domain facts (findings, deltas, cost) which the workflow
 * output alone would not give across restarts.
 */

export type RunRecord = {
  instanceId: string;
  projectId: string;
  versionId: string;
  modelName: string | null;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  indexedObjects: number | null;
  findings: number | null;
  deltas: number | null;
  costUsd: number | null;
  issueIdentifier: string | null;
  error: string | null;
};

function toRecord(row: Record<string, unknown>): RunRecord {
  const num = (value: unknown) => (value === null ? null : Number(value));
  const str = (value: unknown) => (value === null ? null : String(value));
  return {
    instanceId: String(row.instance_id),
    projectId: String(row.project_id),
    versionId: String(row.version_id),
    modelName: str(row.model_name),
    status: String(row.status),
    startedAt: String(row.started_at),
    finishedAt: str(row.finished_at),
    indexedObjects: num(row.indexed_objects),
    findings: num(row.findings),
    deltas: num(row.deltas),
    costUsd: num(row.cost_usd),
    issueIdentifier: str(row.issue_identifier),
    error: str(row.error)
  };
}

export async function recordRunStarted(
  env: Env,
  input: {
    instanceId: string;
    projectId: string;
    versionId: string;
    modelName?: string | null;
  }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO runs (instance_id, project_id, version_id, model_name, status, started_at)
     VALUES (?, ?, ?, ?, 'running', ?)
     ON CONFLICT(instance_id) DO NOTHING`
  )
    .bind(
      input.instanceId,
      input.projectId,
      input.versionId,
      input.modelName ?? null,
      new Date().toISOString()
    )
    .run();
}

/**
 * Merge in whatever the run has learned so far.
 *
 * Steps report as they complete, so this is called several times per run with
 * partial information — `COALESCE` keeps an earlier value when a later update
 * has nothing to say about that column.
 */
export async function updateRun(
  env: Env,
  instanceId: string,
  patch: Partial<{
    status: string;
    modelName: string | null;
    indexedObjects: number;
    findings: number;
    deltas: number;
    costUsd: number;
    issueIdentifier: string | null;
    error: string | null;
    finished: boolean;
    /** Stamp `last_progress_at` — proof of life for the reaper. */
    heartbeat: boolean;
  }>
): Promise<void> {
  await env.DB.prepare(
    `UPDATE runs SET
       status = COALESCE(?, status),
       model_name = COALESCE(?, model_name),
       indexed_objects = COALESCE(?, indexed_objects),
       findings = COALESCE(?, findings),
       deltas = COALESCE(?, deltas),
       cost_usd = COALESCE(?, cost_usd),
       issue_identifier = COALESCE(?, issue_identifier),
       error = COALESCE(?, error),
       finished_at = COALESCE(?, finished_at),
       last_progress_at = COALESCE(?, last_progress_at)
     WHERE instance_id = ?`
  )
    .bind(
      patch.status ?? null,
      patch.modelName ?? null,
      patch.indexedObjects ?? null,
      patch.findings ?? null,
      patch.deltas ?? null,
      patch.costUsd ?? null,
      patch.issueIdentifier ?? null,
      patch.error ?? null,
      patch.finished ? new Date().toISOString() : null,
      patch.heartbeat ? new Date().toISOString() : null,
      instanceId
    )
    .run();
}

export type UnfinishedRun = {
  instanceId: string;
  projectId: string;
  versionId: string;
  startedAt: string;
  lastProgressAt: string | null;
};

/**
 * Runs with no terminal state whose last sign of life — heartbeat, or start
 * time when none was ever written — predates `cutoff`. ISO-8601 strings
 * compare correctly as text, so the filter happens in SQL.
 */
export async function listUnfinishedRunsStalledSince(
  env: Env,
  cutoff: Date
): Promise<UnfinishedRun[]> {
  const { results } = await env.DB.prepare(
    `SELECT instance_id, project_id, version_id, started_at, last_progress_at
     FROM runs
     WHERE finished_at IS NULL
       AND COALESCE(last_progress_at, started_at) < ?`
  )
    .bind(cutoff.toISOString())
    .all();
  return (results ?? []).map((row) => ({
    instanceId: String(row.instance_id),
    projectId: String(row.project_id),
    versionId: String(row.version_id),
    startedAt: String(row.started_at),
    lastProgressAt:
      row.last_progress_at === null ? null : String(row.last_progress_at)
  }));
}

export async function listRuns(env: Env, limit = 50): Promise<RunRecord[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM runs ORDER BY started_at DESC LIMIT ?"
  )
    .bind(Math.min(limit, 200))
    .all();
  return (results ?? []).map((row) => toRecord(row as Record<string, unknown>));
}

/**
 * Per-scout progress within one run.
 *
 * The fleet runs in parallel, so the run row alone cannot say which scout is
 * still judging and which already filed — these rows can. Status walks
 * inspecting -> filing -> complete | no_findings | skipped | failed.
 */
export type ScoutRunRecord = {
  instanceId: string;
  scoutId: string;
  scoutTitle: string;
  status: string;
  findings: number | null;
  deltas: number | null;
  costUsd: number | null;
  issueIdentifier: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

function toScoutRecord(row: Record<string, unknown>): ScoutRunRecord {
  const num = (value: unknown) => (value === null ? null : Number(value));
  const str = (value: unknown) => (value === null ? null : String(value));
  return {
    instanceId: String(row.instance_id),
    scoutId: String(row.scout_id),
    scoutTitle: String(row.scout_title),
    status: String(row.status),
    findings: num(row.findings),
    deltas: num(row.deltas),
    costUsd: num(row.cost_usd),
    issueIdentifier: str(row.issue_identifier),
    error: str(row.error),
    startedAt: String(row.started_at),
    finishedAt: str(row.finished_at)
  };
}

/**
 * Idempotent start marker. DO NOTHING on conflict: a workflow engine re-run
 * replays this call after the scout has already finished, and must not drag
 * a terminal row back to "inspecting".
 */
export async function recordScoutRunStarted(
  env: Env,
  input: { instanceId: string; scoutId: string; scoutTitle: string }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO scout_runs (instance_id, scout_id, scout_title, status, started_at)
     VALUES (?, ?, ?, 'inspecting', ?)
     ON CONFLICT(instance_id, scout_id) DO NOTHING`
  )
    .bind(
      input.instanceId,
      input.scoutId,
      input.scoutTitle,
      new Date().toISOString()
    )
    .run();
}

/** Merge in whatever the scout has learned so far, `updateRun`-style. */
export async function updateScoutRun(
  env: Env,
  instanceId: string,
  scoutId: string,
  patch: Partial<{
    status: string;
    findings: number;
    deltas: number;
    costUsd: number;
    issueIdentifier: string | null;
    error: string | null;
    finished: boolean;
  }>
): Promise<void> {
  await env.DB.prepare(
    `UPDATE scout_runs SET
       status = COALESCE(?, status),
       findings = COALESCE(?, findings),
       deltas = COALESCE(?, deltas),
       cost_usd = COALESCE(?, cost_usd),
       issue_identifier = COALESCE(?, issue_identifier),
       error = COALESCE(?, error),
       finished_at = COALESCE(?, finished_at)
     WHERE instance_id = ? AND scout_id = ?`
  )
    .bind(
      patch.status ?? null,
      patch.findings ?? null,
      patch.deltas ?? null,
      patch.costUsd ?? null,
      patch.issueIdentifier ?? null,
      patch.error ?? null,
      patch.finished ? new Date().toISOString() : null,
      instanceId,
      scoutId
    )
    .run();
}

/** Scout rows for a set of runs, grouped by instance for the API to attach. */
export async function listScoutRuns(
  env: Env,
  instanceIds: string[]
): Promise<Map<string, ScoutRunRecord[]>> {
  const grouped = new Map<string, ScoutRunRecord[]>();
  if (instanceIds.length === 0) return grouped;

  const placeholders = instanceIds.map(() => "?").join(", ");
  const { results } = await env.DB.prepare(
    `SELECT * FROM scout_runs
     WHERE instance_id IN (${placeholders})
     ORDER BY started_at ASC`
  )
    .bind(...instanceIds)
    .all();

  for (const row of results ?? []) {
    const record = toScoutRecord(row as Record<string, unknown>);
    const bucket = grouped.get(record.instanceId) ?? [];
    bucket.push(record);
    grouped.set(record.instanceId, bucket);
  }
  return grouped;
}
