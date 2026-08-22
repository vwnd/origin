export default defineEventHandler((event) => {
  const { backendUrl } = useRuntimeConfig()
  const projectId = getRouterParam(event, 'projectId')
  const conventionId = getRouterParam(event, 'conventionId')
  const versionId = getRouterParam(event, 'versionId')

  return proxyRequest(
    event,
    `${backendUrl}/api/projects/${projectId}/conventions/${conventionId}/versions/${versionId}/content`
  )
})
