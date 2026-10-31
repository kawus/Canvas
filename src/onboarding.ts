/**
 * The first-run welcome tour: shown once to new people. `?tour` in the
 * address shows it again (the help centre links to it).
 */

const SEEN_KEY = 'canvas-welcomed'

function readFlag(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return '1'
  }
}

/** Decided before the app starts, so returning visitors (and My Canvas links) never see it. */
const firstRun = (() => {
  const params = new URLSearchParams(location.search)
  if (params.has('tour')) {
    params.delete('tour')
    const query = params.toString()
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`)
    return true
  }
  // canvas-keys-v1 is set on every earlier visit: those people already know Canvas
  return !readFlag(SEEN_KEY) && !readFlag('canvas-keys-v1') && !location.hash.startsWith('#me=') && location.hash !== '#stats'
})()

export function shouldWelcome() {
  return firstRun
}

export function markWelcomed() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* ignore */
  }
}
