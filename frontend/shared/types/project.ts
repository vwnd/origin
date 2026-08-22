export interface Project {
  id: string
  name: string
}

export interface ProjectListResponse {
  items: Project[]
  page: number
  pageSize: number
  totalCount: number
}

export interface ProjectConventionSummary {
  id: string
  name: string
  description: string | null
  /** Whether the project runs this convention. */
  isActive: boolean
  /** Execution order within the project, ascending. */
  priority: number
  latestVersionId: string | null
  latestVersionCreatedAtUtc: string | null
  versionCount: number
}

export interface ProjectConventionListResponse {
  items: ProjectConventionSummary[]
  page: number
  pageSize: number
  totalCount: number
}

export interface ProjectConventionContent {
  conventionId: string
  conventionName: string
  versionId: string
  versionNumber: number
  versionCount: number
  createdAtUtc: string
  content: string
}

export interface ProjectConventionVersionSummary {
  id: string
  number: number
  createdAtUtc: string
}

export interface ProjectConventionDetail {
  id: string
  name: string
  description: string | null
  isActive: boolean
  priority: number
  versions: ProjectConventionVersionSummary[]
}

/** What the toggle endpoint answers with — the state the convention landed on. */
export interface ProjectConventionActivation {
  id: string
  isActive: boolean
}

/** Every convention on the project, in execution order, as returned by a re-order. */
export interface ProjectConventionOrder {
  conventionIds: string[]
}

export interface ProjectConventionMetadata {
  id: string
  name: string
  description: string | null
}
