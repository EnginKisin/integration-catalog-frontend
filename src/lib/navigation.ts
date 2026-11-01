import { captureAccountLink, clearAccountLink } from './accountLinkStore.ts'
const routeListeners = new Set<() => void>()
export const getPath = () => window.location.pathname
export const subscribePath = (listener: () => void) => { routeListeners.add(listener); return () => { routeListeners.delete(listener) } }
function syncRoute(capture = false) {
  if (window.location.pathname !== '/account/action') clearAccountLink()
  else if (capture && window.location.hash) captureAccountLink(window.location, window.history)
  routeListeners.forEach((listener) => listener())
}
export function initializeNavigation() {
  if (window.location.pathname === '/account/action') captureAccountLink(window.location, window.history)
  const onChange = () => syncRoute(true)
  window.addEventListener('popstate', onChange)
  window.addEventListener('hashchange', onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener('hashchange', onChange)
  }
}
export function navigateRoute(path: '/' | '/login' | '/forgot-password', replace = false) {
  if (path === window.location.pathname) return
  window.history[replace ? 'replaceState' : 'pushState'](null, '', path)
  syncRoute()
  window.scrollTo(0, 0)
}
