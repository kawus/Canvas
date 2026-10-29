/**
 * Cloud storage for boards — a single Vercel Function backed by Redis (Upstash).
 *
 *   GET    /api/board?id=<id>   → 200 board JSON | 404
 *   PUT    /api/board?id=<id>   → 200 { updatedAt }      (body: board JSON)
 *   DELETE /api/board?id=<id>   → 204
 *
 * There are no accounts: the random board id in the link is the key, so anyone
 * with the link can open and edit the board. If no database is connected the
 * function answers 503 and the app quietly keeps boards on the device only.
 *
 * Plain JavaScript (type-checked through JSDoc) so Vercel runs it without a compile step.
 */

import { json, redis, redisConfig } from './_redis.js'

const MAX_BYTES = 4_000_000 // Vercel's request body limit is 4.5 MB
const TTL_SECONDS = 60 * 60 * 24 * 365 // boards expire after a year without edits
const ID_RE = /^[a-z0-9]{6,32}$/

/** @param {Request} request */
function boardId(request) {
  const id = new URL(request.url).searchParams.get('id') ?? ''
  return ID_RE.test(id) ? id : null
}

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handle(request) {
  if (!redisConfig()) return json({ error: 'cloud storage not configured' }, 503)
  const id = boardId(request)
  if (!id) return json({ error: 'invalid id' }, 400)
  const key = `board:${id}`

  try {
    switch (request.method) {
      case 'GET': {
        const raw = /** @type {string | null} */ (await redis(['GET', key]))
        if (!raw) return json({ error: 'not found' }, 404)
        return new Response(raw, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
      }
      case 'PUT': {
        const text = await request.text()
        if (text.length > MAX_BYTES) return json({ error: 'board too large' }, 413)
        /** @type {{ id?: unknown, title?: unknown, elements?: unknown, createdAt?: unknown, updatedAt?: unknown, shared?: unknown }} */
        let doc
        try {
          doc = JSON.parse(text)
        } catch {
          return json({ error: 'invalid json' }, 400)
        }
        if (doc.id !== id || !Array.isArray(doc.elements) || typeof doc.updatedAt !== 'number') {
          return json({ error: 'invalid board' }, 400)
        }
        const clean = {
          id,
          title: String(doc.title ?? 'Untitled').slice(0, 200),
          elements: doc.elements,
          createdAt: typeof doc.createdAt === 'number' ? doc.createdAt : doc.updatedAt,
          updatedAt: doc.updatedAt,
          // once shared, every device that opens the board joins it live
          shared: doc.shared === true,
        }
        await redis(['SET', key, JSON.stringify(clean), 'EX', TTL_SECONDS])
        return json({ updatedAt: clean.updatedAt })
      }
      case 'DELETE':
        await redis(['DEL', key])
        return new Response(null, { status: 204 })
      default:
        return json({ error: 'method not allowed' }, 405)
    }
  } catch (err) {
    console.error(err)
    return json({ error: 'storage unavailable' }, 502)
  }
}

// Vercel's Web-standard handler: one function serves every method.
export default { fetch: handle }
