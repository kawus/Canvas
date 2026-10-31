/**
 * Cloud storage for boards — a single Vercel Function backed by Redis (Upstash).
 *
 *   GET    /api/board?id=<id>   → 200 board JSON | 404
 *   PUT    /api/board?id=<id>   → 200 { updatedAt }      (body: board JSON)
 *   DELETE /api/board?id=<id>   → 204
 *
 * There are no accounts. Anyone with a board's id can view it; changing or
 * deleting it needs its edit key (X-Edit-Key), which only the owner / edit
 * link carries. If no database is connected the function answers 503 and the
 * app quietly keeps boards on the device only.
 *
 * Plain JavaScript (type-checked through JSDoc) so Vercel runs it without a compile step.
 */

import { isActive, paywallEnabled, verifyToken } from './_pro.js'
import { allowStorage, tooMuch } from './_limits.js'
import { json, redis, redisConfig, sha256 } from './_redis.js'

const MAX_BYTES = 4_000_000 // Vercel's request body limit is 4.5 MB
const TTL_SECONDS = 60 * 60 * 24 * 365 // boards expire after a year without edits
const ID_RE = /^[a-z0-9]{6,32}$/

/** @param {Request} request */
function boardId(request) {
  const id = new URL(request.url).searchParams.get('id') ?? ''
  return ID_RE.test(id) ? id : null
}

/**
 * Who may change a board: whoever holds its edit key (part of the owner /
 * edit link). The server keeps only a hash of it. A new board belongs to the
 * key it's first saved with; a board saved before keys existed can no longer
 * be claimed by anyone (make a copy to keep editing it).
 * @param {{ keyHash?: string } | null} record
 * @param {string | null} key
 */
async function canEdit(record, key) {
  if (!key || key.length < 16) return false
  if (!record) return true
  if (!record.keyHash) return false
  return (await sha256(key)) === record.keyHash
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
  const editKey = request.headers.get('x-edit-key')

  try {
    const raw = /** @type {string | null} */ (await redis(['GET', key]))
    /** @type {any} */
    const record = raw ? JSON.parse(raw) : null
    switch (request.method) {
      case 'GET': {
        if (!record) return json({ error: 'not found' }, 404)
        // a device checking for changes made elsewhere: answer briefly when there are none
        const since = Number(new URL(request.url).searchParams.get('since'))
        if (since && typeof record.updatedAt === 'number' && record.updatedAt <= since) return json({ unchanged: true })
        // never reveal the key hash or who pays; just whether live editing is paid for right now
        const { keyHash: _k, proCustomer, ...pub } = record
        const pro = !!proCustomer && (!paywallEnabled() || (await isActive(proCustomer).catch(() => true)))
        return json({ ...pub, pro })
      }
      case 'PUT': {
        if (!(await canEdit(record, editKey))) return json({ error: 'view only' }, 403)
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
        // A Pro owner sharing the board pays for live editing on it
        let proCustomer = record?.proCustomer
        if (doc.shared === true && !proCustomer) {
          const customer = await verifyToken(request.headers.get('x-pro-token'))
          if (customer && (await isActive(customer))) proCustomer = customer
        }
        const clean = {
          id,
          title: String(doc.title ?? 'Untitled').slice(0, 200),
          elements: doc.elements,
          createdAt: typeof doc.createdAt === 'number' ? doc.createdAt : doc.updatedAt,
          updatedAt: doc.updatedAt,
          // once shared, every editor that opens the board joins it live
          shared: doc.shared === true,
          keyHash: record?.keyHash || (await sha256(/** @type {string} */ (editKey))),
          ...(proCustomer ? { proCustomer } : {}),
        }
        const stored = JSON.stringify(clean)
        // only growth counts toward the daily allowance (re-saving a board costs nothing)
        if (!(await allowStorage(request, stored.length - (raw?.length ?? 0)))) return tooMuch()
        await redis(['SET', key, stored, 'EX', TTL_SECONDS])
        return json({ updatedAt: clean.updatedAt, pro: !!proCustomer })
      }
      case 'DELETE':
        if (!record) return new Response(null, { status: 204 })
        if (!(await canEdit(record, editKey))) return json({ error: 'view only' }, 403)
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
