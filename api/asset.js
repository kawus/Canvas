/**
 * Image storage for boards, content-addressed.
 *
 *   GET /api/asset?id=<hash>   → 200 data URL (text) | 404
 *   PUT /api/asset?id=<hash>   → 204                (body: data URL)
 *
 * Images live apart from the board so a board stays small and quick to sync.
 * The id is the SHA-256 of the data, so an image can never be overwritten
 * with different content.
 */

import { json, redis, redisConfig } from './_redis.js'

const MAX_BYTES = 4_000_000
const TTL_SECONDS = 60 * 60 * 24 * 400
const ID_RE = /^[a-f0-9]{24}$/
const DATA_RE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/

/** @param {string} text */
async function hashOf(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24)
}

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handle(request) {
  if (!redisConfig()) return json({ error: 'cloud storage not configured' }, 503)
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!ID_RE.test(id)) return json({ error: 'invalid id' }, 400)
  const key = `asset:${id}`
  try {
    if (request.method === 'GET') {
      // GETEX refreshes the expiry: images in use never expire
      const data = /** @type {string | null} */ (await redis(['GETEX', key, 'EX', TTL_SECONDS]))
      if (!data) return json({ error: 'not found' }, 404)
      return new Response(data, {
        headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=31536000, immutable' },
      })
    }
    if (request.method === 'PUT') {
      const text = await request.text()
      if (text.length > MAX_BYTES) return json({ error: 'image too large' }, 413)
      if (!DATA_RE.test(text)) return json({ error: 'not an image' }, 400)
      if ((await hashOf(text)) !== id) return json({ error: 'hash mismatch' }, 400)
      await redis(['SET', key, text, 'EX', TTL_SECONDS])
      return new Response(null, { status: 204 })
    }
    return json({ error: 'method not allowed' }, 405)
  } catch (err) {
    console.error(err)
    return json({ error: 'storage unavailable' }, 502)
  }
}

export default { fetch: handle }
