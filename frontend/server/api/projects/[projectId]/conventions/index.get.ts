export default defineEventHandler((event) => {
  const { backendUrl } = useRuntimeConfig()
  const projectId = getRouterParam(event, 'projectId')
  const { search } = getRequestURL(event)

  return proxyRequest(event, `${backendUrl}/api/projects/${projectId}/conventions${search}`)
})
