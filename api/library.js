/**
 * "My Canvas": a private, account-free backup of someone's board list (with
 * edit rights) and Pro, so their private link restores everything on a new device.
 *
 *   GET /api/library?id=<id>   (X-Library-Auth) → { data, updatedAt } | 404
 *   PUT /api/library?id=<id>   (X-Library-Auth) { data, updatedAt }  → 204
 *
 * `data` is encrypted in the browser with a key that never leaves it; the
 * server stores only that ciphertext and a hash of a separate access proof.
 */

import { allowStorage, tooMuch } from './_limits.js'
import { json, redis, redisConfig, sha256 } from './_redis.js'

const ID_RE = /^[a-z0-9]{10,32}$/
const AUTH_RE = /^[a-f0-9]{64}$/
const MAX = 600_000
const TTL = 60 * 60 * 24 * 730 // two years since the last visit

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handle(request) {
  if (!redisConfig()) return json({ error: 'cloud storage not configured' }, 503)
  const id = new URL(request.url).searchParams.get('id') ?? ''
  const auth = request.headers.get('x-library-auth') ?? ''
  if (!ID_RE.test(id) || !AUTH_RE.test(auth)) return json({ error: 'invalid request' }, 400)
  const key = `lib:${id}`
  try {
    const raw = /** @type {string | null} */ (await redis(['GETEX', key, 'EX', TTL]))
    /** @type {{ authHash: string, data: string, updatedAt: number } | null} */
    const record = raw ? JSON.parse(raw) : null
    const authHash = await sha256(auth)
    if (record && record.authHash !== authHash) return json({ error: 'forbidden' }, 403)

    if (request.method === 'GET') {
      if (!record) return json({ error: 'not found' }, 404)
      return json({ data: record.data, updatedAt: record.updatedAt })
    }
    if (request.method === 'PUT') {
      const text = await request.text()
      if (text.length > MAX) return json({ error: 'too large' }, 413)
      const body = /** @type {{ data?: unknown, updatedAt?: unknown }} */ (JSON.parse(text))
      if (typeof body.data !== 'string' || typeof body.updatedAt !== 'number') return json({ error: 'invalid' }, 400)
      const stored = JSON.stringify({ authHash, data: body.data, updatedAt: body.updatedAt })
      if (!(await allowStorage(request, stored.length - (raw?.length ?? 0)))) return tooMuch()
      await redis(['SET', key, stored, 'EX', TTL])
      return new Response(null, { status: 204 })
    }
    return json({ error: 'method not allowed' }, 405)
  } catch (err) {
    console.error(err)
    return json({ error: 'storage unavailable' }, 502)
  }
}

export default { fetch: handle }
