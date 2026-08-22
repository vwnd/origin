export default defineEventHandler((event) => {
  const { backendUrl } = useRuntimeConfig()
  const { search } = getRequestURL(event)

  return proxyRequest(event, `${backendUrl}/api/projects${search}`)
})
