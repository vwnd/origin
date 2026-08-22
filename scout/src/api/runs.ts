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
       finished_at = COALESCE(?, finished_at)
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
      instanceId
    )
    .run();
}

export async function listRuns(env: Env, limit = 50): Promise<RunRecord[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM runs ORDER BY started_at DESC LIMIT ?"
  )
    .bind(Math.min(limit, 200))
    .all();
  return (results ?? []).map((row) => toRecord(row as Record<string, unknown>));
}
