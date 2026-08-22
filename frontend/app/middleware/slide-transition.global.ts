export default defineNuxtRouteMiddleware((to, from) => {
  const toIndex = demoSlides.indexOf(to.path)
  const fromIndex = demoSlides.indexOf(from.path)

  if (toIndex === -1 || fromIndex === -1 || toIndex === fromIndex) {
    return
  }

  to.meta.pageTransition = {
    name: toIndex > fromIndex ? 'slide-forward' : 'slide-back',
    mode: 'out-in'
  }
})
