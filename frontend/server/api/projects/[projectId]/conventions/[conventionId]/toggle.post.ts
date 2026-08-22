export default defineEventHandler((event) => {
  const { backendUrl } = useRuntimeConfig()
  const projectId = getRouterParam(event, 'projectId')
  const conventionId = getRouterParam(event, 'conventionId')

  return proxyRequest(event, `${backendUrl}/api/projects/${projectId}/conventions/${conventionId}/toggle`)
})
