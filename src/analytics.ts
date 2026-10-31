import type { BeforeSendEvent } from '@vercel/analytics'

/**
 * Vercel Web Analytics (cookieless visit counts). Board links carry secrets after
 * the # (edit keys, My Canvas links) and one-off flags after the ?, so only the
 * page itself is ever sent: "/", "/intro/", "/help/devices/" — never which board.
 */
export function pageOnly(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url)
  url.hash = ''
  url.search = ''
  return { ...event, url: url.toString() }
}
