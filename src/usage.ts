import { getMe } from './collab'

/**
 * Board sync usage for /#stats: how many "anything new?" checks this device
 * makes (each is one small database read) and how many found changes. Counted
 * here and reported in batches, so counting adds no request per check.
 */

let checks = 0
let changed = 0
let started = false

function report() {
  if (!checks) return
  const body = JSON.stringify({ checks, changed, device: getMe().id })
  checks = 0
  changed = 0
  // sendBeacon still delivers while the page is closing
  if (!navigator.sendBeacon?.('api/pro?action=usage', body)) {
    void fetch('api/pro?action=usage', { method: 'POST', body, keepalive: true }).catch(() => {})
  }
}

export function countCheck(foundChanges: boolean) {
  checks++
  if (foundChanges) changed++
  if (started) return
  started = true
  setInterval(report, 5 * 60 * 1000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && report())
  window.addEventListener('pagehide', report)
}
