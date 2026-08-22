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
  versions: ProjectConventionVersionSummary[]
}

export interface ProjectConventionMetadata {
  id: string
  name: string
  description: string | null
}
