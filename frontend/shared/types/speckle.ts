/**
 * A Speckle project shaped as a select-menu option. `label` is the project name and is what gets
 * rendered, `value` is the Speckle project id and is what gets selected — these are USelectMenu's
 * default `label-key` / `value-key`, so no overrides are needed.
 */
export interface SpeckleProjectOption {
  value: string
  label: string
}

/**
 * Speckle paginates by cursor. Pass `cursor` back as `?cursor=` to load the next page; it is
 * `null` once every project has been returned.
 */
export interface SpeckleProjectOptionListResponse {
  items: SpeckleProjectOption[]
  cursor: string | null
  totalCount: number
}
