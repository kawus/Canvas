import { flushSave } from './boards'
import { useStore } from './store'

/**
 * Keeping an open tab working across updates. Every release replaces the
 * previous version's files, so a tab opened before an update can't load parts
 * it hasn't needed yet (PDF export, live editing). Canvas therefore notices
 * new versions and reloads itself, saved first, while you're away from the
 * tab; and if a part fails to load before that, it reloads right away.
 */

const RELOADED = 'canvas-reloaded'
const NOTE = 'canvas-update-note'
const CHECK_EVERY = 30 * 60 * 1000

const versionIn = (html: string) => /assets\/index-[\w-]+\.js/.exec(html)?.[0] ?? null
const running = versionIn(document.querySelector('script[type="module"][src*="assets/index-"]')?.getAttribute('src') ?? '')

let pending = false
let lastCheck = 0

async function newerVersion() {
  lastCheck = Date.now()
  try {
    const res = await fetch('./', { cache: 'no-store' })
    const live = res.ok ? versionIn(await res.text()) : null
    return !!live && !!running && live !== running
  } catch {
    return false
  }
}

function reloadedJustNow() {
  try {
    return Date.now() - Number(sessionStorage.getItem(RELOADED) ?? 0) < 30_000
  } catch {
    return false
  }
}

async function reload(note: boolean) {
  await flushSave().catch(() => {})
  try {
    sessionStorage.setItem(RELOADED, String(Date.now()))
    if (note) sessionStorage.setItem(NOTE, '1')
  } catch {
    /* ignore */
  }
  location.reload()
}

export function startUpdates() {
  // only built versions have versioned files
  if (!running) return
  try {
    if (sessionStorage.getItem(NOTE)) {
      sessionStorage.removeItem(NOTE)
      setTimeout(() => useStore.getState().showToast('Canvas was just updated — please try that again'), 600)
    }
  } catch {
    /* ignore */
  }

  // a part of the old version is gone: reload now (unless that just happened)
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault()
    // (after the failed action's own message, so this one is what you see)
    if (reloadedJustNow()) setTimeout(() => useStore.getState().showToast('Canvas was updated — reload the page to continue'), 150)
    else void reload(true)
  })

  const check = async () => {
    if (!pending && Date.now() - lastCheck > 60_000) pending = await newerVersion()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check()
    // you're away: the quietest moment to switch to the new version
    else if (pending && !reloadedJustNow()) void reload(false)
  })
  setInterval(() => document.visibilityState === 'visible' && void check(), CHECK_EVERY)
}
