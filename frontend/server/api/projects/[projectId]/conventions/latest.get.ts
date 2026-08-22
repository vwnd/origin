export default defineEventHandler((event) => {
  const { backendUrl } = useRuntimeConfig()
  const projectId = getRouterParam(event, 'projectId')

  return proxyRequest(event, `${backendUrl}/api/projects/${projectId}/conventions/latest`)
})
