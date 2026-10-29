/**
 * Live collaboration sign-in (Liveblocks), no accounts needed.
 *
 *   GET    /api/collab             → { enabled, baseUrl? }   is live collaboration set up?
 *   POST   /api/collab             → { token }               access to one board's room
 *   DELETE /api/collab?room=<id>   → 204                     remove a deleted board's room
 *
 * Needs LIVEBLOCKS_SECRET_KEY (set by the Liveblocks integration on Vercel,
 * or copied from the Liveblocks dashboard). Without it the app works as
 * before, just without live collaboration.
 */

import { json } from './_redis.js'

const ROOM_RE = /^canvas-[a-z0-9]{6,32}$/
const USER_RE = /^[a-z0-9]{8,40}$/
const COLOR_RE = /^#[0-9a-f]{6}$/i

const secret = () => process.env.LIVEBLOCKS_SECRET_KEY
// only set when testing against the local Liveblocks dev server
const baseUrl = () => process.env.LIVEBLOCKS_BASE_URL

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handle(request) {
  if (request.method === 'GET') return json({ enabled: !!secret(), ...(baseUrl() ? { baseUrl: baseUrl() } : {}) })
  if (request.method === 'DELETE') {
    // a deleted board takes its live room with it
    const room = new URL(request.url).searchParams.get('room') ?? ''
    if (!secret() || !ROOM_RE.test(room)) return json({ error: 'invalid room' }, 400)
    await fetch(`${baseUrl() || 'https://api.liveblocks.io'}/v2/rooms/${room}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${secret()}` },
    }).catch(() => {})
    return new Response(null, { status: 204 })
  }
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!secret()) return json({ error: 'forbidden', reason: 'Live collaboration is not set up' }, 403)

  let body
  try {
    body = /** @type {{ room?: unknown, userId?: unknown, name?: unknown, color?: unknown }} */ (await request.json())
  } catch {
    return json({ error: 'forbidden', reason: 'Invalid request' }, 403)
  }
  const room = String(body.room ?? '')
  const userId = String(body.userId ?? '')
  if (!ROOM_RE.test(room) || !USER_RE.test(userId)) return json({ error: 'forbidden', reason: 'Invalid room' }, 403)
  const name = String(body.name ?? 'Guest').slice(0, 40)
  const color = COLOR_RE.test(String(body.color)) ? String(body.color) : '#0a84ff'

  try {
    const res = await fetch(`${baseUrl() || 'https://api.liveblocks.io'}/v2/authorize-user`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json' },
      // anyone with a board's link may edit it, so grant full access to that one room
      body: JSON.stringify({ userId, userInfo: { name, color }, permissions: { [room]: ['room:write'] } }),
    })
    const data = /** @type {{ token?: string }} */ (await res.json())
    if (!res.ok || !data.token) {
      console.error('Liveblocks authorize-user failed', res.status, data)
      return json({ error: 'forbidden', reason: 'Could not join the board' }, 403)
    }
    return json({ token: data.token })
  } catch (err) {
    console.error(err)
    return json({ error: 'unavailable' }, 502)
  }
}

export default { fetch: handle }
