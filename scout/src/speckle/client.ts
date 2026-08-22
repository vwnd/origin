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

/**
 * Speckle resource identifier for a specific version of a model.
 * Passing this as `resourceIdString` pins the issue to that version.
 */
export function versionResourceId(modelId: string, versionId: string): string {
  return `${modelId}@${versionId}`;
}

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
    resourceIdString?: string;
  }
): Promise<CreatedIssue> {
  const data = await graphql<{
    projectMutations: { issues: { createIssue: CreatedIssue } };
  }>(token, CREATE_ISSUE, {
    input: {
      projectId: input.projectId,
      title: input.title,
      resourceIdString: input.resourceIdString,
      ...(input.description
        ? { description: proseMirrorDoc(input.description) }
        : {})
    }
  });

  return data.projectMutations.issues.createIssue;
}
