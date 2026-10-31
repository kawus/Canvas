/**
 * Link-preview pictures of boards (a 1200×630 snapshot the app makes when you share).
 *
 *   GET /api/preview?id=<board>                    → the image (for messaging and social apps)
 *   PUT /api/preview?id=<board>  (X-Edit-Key)      → 204   (body: data URL of a JPEG or PNG)
 *
 * One picture per board, replaced in place, so storage doesn't pile up. Only
 * someone who can edit the board can change it; anyone with the board's link
 * can already see the board itself.
 */

import { allowStorage, tooMuch } from './_limits.js'
import { json, redis, redisConfig, sha256 } from './_redis.js'

const ID_RE = /^[a-z0-9]{6,32}$/
const DATA_RE = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/
const MAX = 600_000
const TTL = 60 * 60 * 24 * 365

/** @param {Request} request */
export async function handle(request) {
  if (!redisConfig()) return json({ error: 'cloud storage not configured' }, 503)
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!ID_RE.test(id)) return json({ error: 'invalid id' }, 400)
  const key = `preview:${id}`
  try {
    if (request.method === 'GET') {
      const data = /** @type {string | null} */ (await redis(['GET', key]))
      const m = data ? DATA_RE.exec(data) : null
      if (!m) return json({ error: 'not found' }, 404)
      return new Response(Buffer.from(m[2], 'base64'), {
        headers: {
          'Content-Type': `image/${m[1]}`,
          // the link carries the picture's version (?v=…), so it can be cached
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      })
    }
    if (request.method === 'PUT') {
      const raw = /** @type {string | null} */ (await redis(['GET', `board:${id}`]))
      const board = raw ? JSON.parse(raw) : null
      const editKey = request.headers.get('x-edit-key') ?? ''
      if (!board?.keyHash || editKey.length < 16 || (await sha256(editKey)) !== board.keyHash) return json({ error: 'view only' }, 403)
      const text = await request.text()
      if (text.length > MAX) return json({ error: 'too large' }, 413)
      if (!DATA_RE.test(text)) return json({ error: 'not an image' }, 400)
      const old = /** @type {number} */ (await redis(['STRLEN', key])) || 0
      if (!(await allowStorage(request, text.length - old))) return tooMuch()
      await redis(['SET', key, text, 'EX', TTL])
      return new Response(null, { status: 204 })
    }
    return json({ error: 'method not allowed' }, 405)
  } catch (err) {
    console.error(err)
    return json({ error: 'storage unavailable' }, 502)
  }
}

export default { fetch: handle }
