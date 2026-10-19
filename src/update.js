// Reload when a newer deploy is live. GitHub Pages caches index.html for a few
// minutes and the home-screen app has no reload button, so check on open and on return.
const url = import.meta.env.BASE_URL + 'version.json'

async function check() {
  if (import.meta.env.DEV || import.meta.env.MODE === 'demo') return
  try {
    const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
    const { build } = await r.json()
    if (build && build !== __BUILD__ && sessionStorage.getItem('reloaded-for') !== build) {
      sessionStorage.setItem('reloaded-for', build)
      location.reload()
    }
  } catch { /* offline */ }
}

export function watchForUpdates() {
  check()
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check() })
}
