export type ScoutMeta = {
  id: string;
  title: string;
  description: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Scout = ScoutMeta & { body: string };

export type Issue = {
  id: string;
  identifier: string;
  title: string | null;
  status: string;
  priority: string | null;
  createdAt: string;
  updatedAt: string;
  rawDescription: string | null;
  author: { user: { name: string | null } | null } | null;
};

/** One scout's progress within a run: inspecting -> filing -> terminal. */
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
  /** What the scout scoped itself to, or why it had nothing to inspect. */
  note: string | null;
  startedAt: string;
  finishedAt: string | null;
};

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
  /** The fleet, one row per scout, live while the run is in flight. */
  scouts: ScoutRunRecord[];
};

const TOKEN_KEY = "origo.adminToken";

/**
 * Token for mutating requests.
 *
 * Writes decide what the inspector looks for, so the API refuses anonymous
 * ones. Held in localStorage rather than embedded in the bundle — a bundled
 * secret would be readable by anyone who loads the page, which is no gate.
 */
export function getAdminToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAdminToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private browsing — the token simply will not persist.
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super("A write token is required");
    this.name = "UnauthorizedError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.method && init.method !== "GET"
        ? { "x-scout-token": getAdminToken() }
        : {}),
      ...(init?.headers ?? {})
    }
  });
  if (response.status === 401) throw new UnauthorizedError();
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new Error(
      String(body.error ?? `Request failed (${response.status})`)
    );
  }
  return body as T;
}

export const api = {
  listScouts: () => request<{ scouts: ScoutMeta[] }>("scouts"),
  getScout: (id: string) =>
    request<{ scout: Scout }>(`scouts/${encodeURIComponent(id)}`),
  createScout: (input: {
    id: string;
    title: string;
    description?: string;
    body: string;
    enabled?: boolean;
  }) =>
    request<{ scout: Scout }>("scouts", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  updateScout: (
    id: string,
    input: {
      title: string;
      description?: string | null;
      body: string;
      enabled?: boolean;
    }
  ) =>
    request<{ scout: Scout }>(`scouts/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input)
    }),
  deleteScout: (id: string) =>
    request<{ deleted: string }>(`scouts/${encodeURIComponent(id)}`, {
      method: "DELETE"
    }),
  listIssues: () =>
    request<{ projectId: string; workspaceId: string | null; issues: Issue[] }>(
      "issues"
    ),
  listRuns: () => request<{ runs: RunRecord[] }>("runs")
};
