import { SPECKLE_SERVER_URL } from "./config";

/**
 * Minimal Speckle GraphQL client.
 *
 * Authenticates with a Personal Access Token (Worker secret `SPECKLE_TOKEN`).
 * The token needs the `streams:write` scope to create issues.
 */

export class SpeckleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "SpeckleApiError";
  }
}

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

async function graphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${SPECKLE_SERVER_URL}/graphql`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new SpeckleApiError(
      `Speckle API responded ${response.status}`,
      response.status,
      await response.text()
    );
  }

  const result = (await response.json()) as GraphQLResponse<T>;

  if (result.errors?.length) {
    throw new SpeckleApiError(
      result.errors.map((e) => e.message).join("; "),
      response.status,
      result.errors
    );
  }

  if (!result.data) {
    throw new SpeckleApiError("Speckle API returned no data", response.status);
  }

  return result.data;
}

/** Speckle stores issue descriptions as ProseMirror documents. */
export function proseMirrorDoc(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }]
  };
}

/** Speckle resource identifier for a specific version of a model. */
export function versionResourceId(modelId: string, versionId: string): string {
  return `${modelId}@${versionId}`;
}

/** Web URL for a specific version of a model. */
export function versionUrl(
  projectId: string,
  modelId: string,
  versionId: string
): string {
  return `${SPECKLE_SERVER_URL}/projects/${projectId}/models/${versionResourceId(modelId, versionId)}`;
}

/**
 * Anchors an issue to 3D data in the viewer.
 *
 * Speckle rejects these three fields unless all are present:
 * "Incomplete 3D data reference provided. viewerState, resourceIdString and
 * screenshot must all be provided together." Grouping them in one object makes
 * a partial anchor unrepresentable — pass the whole thing or nothing.
 */
export type IssueAnchor = {
  /** e.g. `modelId@versionId` — see `versionResourceId`. */
  resourceIdString: string;
  /** SerializedViewerState (camera, filters, loaded resources). */
  viewerState: Record<string, unknown>;
  /** Screenshot of the view, as a data URL. */
  screenshot: string;
};

const CREATE_ISSUE = /* GraphQL */ `
  mutation ScoutCreateIssue($input: CreateIssueInput!) {
    projectMutations {
      issues {
        createIssue(input: $input) {
          id
          number
          identifier
          title
        }
      }
    }
  }
`;

export type CreatedIssue = {
  id: string;
  number: number;
  identifier: string;
  title: string;
};

export async function createIssue(
  token: string,
  input: {
    projectId: string;
    title: string;
    description?: string;
    /** Omit for a project-level issue not tied to any 3D resource. */
    anchor?: IssueAnchor;
  }
): Promise<CreatedIssue> {
  const data = await graphql<{
    projectMutations: { issues: { createIssue: CreatedIssue } };
  }>(token, CREATE_ISSUE, {
    input: {
      projectId: input.projectId,
      title: input.title,
      ...(input.description
        ? { description: proseMirrorDoc(input.description) }
        : {}),
      ...(input.anchor ?? {})
    }
  });

  return data.projectMutations.issues.createIssue;
}

const VERSION_INFO = /* GraphQL */ `
  query ScoutVersionInfo($projectId: String!, $versionId: String!) {
    project(id: $projectId) {
      id
      name
      workspaceId
      version(id: $versionId) {
        id
        referencedObject
        schemaVersion
        packfileSize
        totalChildrenCount
        sourceApplication
        createdAt
        model {
          id
          name
        }
      }
    }
  }
`;

export type VersionInfo = {
  id: string;
  /** Root object id — the entry point for loading the object graph. */
  referencedObject: string | null;
  /**
   * Storage generation. `null` => legacy single-packfile / PG-object version.
   * `3` => v2 three-artefact parquet bundle (presigned /v2 artefacts endpoint).
   * Decides which loader can read this version.
   */
  schemaVersion: number | null;
  packfileSize: string | null;
  totalChildrenCount: number | null;
  sourceApplication: string | null;
  createdAt: string;
  model: { id: string; name: string } | null;
};

/** Metadata needed to decide how (and how much) to load. */
export async function getVersionInfo(
  token: string,
  projectId: string,
  versionId: string
): Promise<{
  projectName: string | null;
  /** Required by the resource-meta mutation. */
  workspaceId: string | null;
  version: VersionInfo | null;
}> {
  const data = await graphql<{
    project: {
      name: string | null;
      workspaceId: string | null;
      version: VersionInfo | null;
    } | null;
  }>(token, VERSION_INFO, { projectId, versionId });

  return {
    projectName: data.project?.name ?? null,
    workspaceId: data.project?.workspaceId ?? null,
    version: data.project?.version ?? null
  };
}

const OPEN_ISSUES = /* GraphQL */ `
  query ScoutOpenIssues($projectId: String!, $limit: Int!, $cursor: String) {
    project(id: $projectId) {
      issues(
        input: {
          statuses: [open, readyForReview]
          limit: $limit
          cursor: $cursor
        }
      ) {
        totalCount
        cursor
        items {
          id
          identifier
          title
          rawDescription
        }
      }
    }
  }
`;

export type OpenIssue = {
  id: string;
  identifier: string;
  title: string | null;
  rawDescription: string | null;
};

/**
 * Issues still open on the project, used to avoid filing a problem twice.
 *
 * Only unresolved statuses are fetched: once someone resolves a Scout issue,
 * the same finding on a later version should be reportable again rather than
 * silently suppressed forever.
 */
export async function listOpenIssues(
  token: string,
  projectId: string,
  maxPages = 5
): Promise<OpenIssue[]> {
  const issues: OpenIssue[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const data: {
      project: {
        issues: {
          cursor: string | null;
          items: OpenIssue[];
        };
      } | null;
    } = await graphql(token, OPEN_ISSUES, { projectId, limit: 100, cursor });

    const collection = data.project?.issues;
    if (!collection) break;
    issues.push(...collection.items);
    if (!collection.cursor || collection.items.length === 0) break;
    cursor = collection.cursor;
  }

  return issues;
}

const CREATE_RESOURCE_META = /* GraphQL */ `
  mutation ScoutCreateResourceMeta($input: CreateResourceMetaInput!) {
    resourceMetaMutations {
      create(input: $input) {
        id
      }
    }
  }
`;

/**
 * One proposed parameter edit on one object, in the shape Speckle's parameter
 * updater writes.
 *
 * `path` is rooted at the object (`properties.…`) and
 * `internalDefinitionName` is Revit's stable handle for the parameter — both
 * are what make the change addressable rather than merely described.
 */
export type ObjectDelta = {
  id: string;
  applicationId: string;
  path: string;
  from: string;
  to: string;
  internalDefinitionName: string;
};

/**
 * Attach proposed edits to an issue as `objectDeltas` resource metadata.
 *
 * This is what turns a finding from a description into something actionable:
 * the same metadata shape Speckle's own parameter updater produces, so the
 * viewer can offer the edits for review and bulk application.
 */
export async function createResourceMeta(
  token: string,
  input: {
    projectId: string;
    workspaceId: string;
    issueId: string;
    changes: ObjectDelta[];
  }
): Promise<{ id: string }> {
  const data = await graphql<{
    resourceMetaMutations: { create: { id: string } };
  }>(token, CREATE_RESOURCE_META, {
    input: {
      data: { version: 1, changes: input.changes },
      metaType: "objectDeltas",
      projectId: input.projectId,
      resourceId: input.issueId,
      resourceType: "issue",
      workspaceId: input.workspaceId
    }
  });

  return data.resourceMetaMutations.create;
}

const PROJECT_ISSUES = /* GraphQL */ `
  query ScoutProjectIssues($projectId: String!, $limit: Int!) {
    project(id: $projectId) {
      issues(input: { limit: $limit }) {
        totalCount
        items {
          id
          identifier
          title
          status
          priority
          createdAt
          updatedAt
          rawDescription
          author {
            user {
              name
            }
          }
        }
      }
    }
  }
`;

export type ProjectIssue = {
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

/** Issues for the Inbox, newest first. */
export async function listProjectIssues(
  token: string,
  projectId: string,
  limit = 50
): Promise<ProjectIssue[]> {
  const data = await graphql<{
    project: { issues: { items: ProjectIssue[] } } | null;
  }>(token, PROJECT_ISSUES, { projectId, limit: Math.min(limit, 100) });
  return data.project?.issues.items ?? [];
}

const WORKSPACE_ID = /* GraphQL */ `
  query ScoutWorkspaceId($projectId: String!) {
    project(id: $projectId) {
      workspaceId
    }
  }
`;

export async function getWorkspaceId(
  token: string,
  projectId: string
): Promise<string | null> {
  const data = await graphql<{
    project: { workspaceId: string | null } | null;
  }>(token, WORKSPACE_ID, { projectId });
  return data.project?.workspaceId ?? null;
}
