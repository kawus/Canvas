/**
 * Feedback on shared boards: likes and short notes from anyone with the link.
 * There are no accounts: people give a name, and the board's owner (whoever
 * holds its edit key) resolves notes or switches feedback off.
 *
 *   GET   /api/feedback?id=<board>           → { on, items }
 *   GET   /api/feedback?ids=<a>,<b>,…        → { counts: { <id>: { open, latest } } }  (for the boards list)
 *   POST  /api/feedback?id=<board>           → like:  { kind: 'like', target, by, on }
 *                                              note:  { kind: 'note', target, text, by }
 *   PATCH /api/feedback?id=<board>           (X-Edit-Key) → { resolve: [ids], resolved } or { on }
 *
 * Feedback is kept apart from the board itself, so leaving a note never needs
 * (or touches) the edit key, and it disappears with the board.
 */

import { allowFeedback, tooMuch } from './_limits.js'
import { json, redis, redisConfig, sha256 } from './_redis.js'

const ID_RE = /^[a-z0-9]{6,32}$/
const TTL_SECONDS = 60 * 60 * 24 * 365
const MAX_ITEMS = 500
const MAX_TEXT = 280
const MAX_NAME = 40

/** @param {unknown} v @param {number} max */
const clean = (v, max) =>
  String(v ?? '')
    // no invisible control characters (line breaks are fine)
    .replace(/\p{Cc}/gu, (c) => (c === '\n' ? c : ''))
    .trim()
    .slice(0, max)

/** @param {unknown} by */
function person(by) {
  const b = /** @type {{ id?: unknown, name?: unknown, color?: unknown }} */ (by && typeof by === 'object' ? by : {})
  const id = String(b.id ?? '')
  if (!/^[a-z0-9]{6,32}$/.test(id)) return null
  const name = clean(b.name, MAX_NAME)
  if (!name) return null
  const color = /^#[0-9a-f]{6}$/i.test(String(b.color)) ? String(b.color) : '#8e8e93'
  return { id, name, color }
}

/** All feedback on a board, as stored (field → JSON). */
async function itemsOf(/** @type {string} */ id) {
  const flat = /** @type {string[] | null} */ (await redis(['HGETALL', `fb:${id}`])) ?? []
  const out = []
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try {
      out.push(JSON.parse(flat[i + 1]))
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** @param {Request} request @returns {Promise<Response>} */
export async function handle(request) {
  if (!redisConfig()) return json({ error: 'cloud storage not configured' }, 503)
  const url = new URL(request.url)

  try {
    // the boards list asks how much open feedback each board has
    const many = url.searchParams.get('ids')
    if (request.method === 'GET' && many !== null) {
      const ids = many.split(',').filter((x) => ID_RE.test(x)).slice(0, 60)
      /** @type {Record<string, { open: number, latest: number }>} */
      const counts = {}
      await Promise.all(
        ids.map(async (b) => {
          const items = await itemsOf(b)
          const open = items.filter((x) => x.kind === 'note' && !x.resolved)
          if (open.length) counts[b] = { open: open.length, latest: Math.max(...open.map((x) => x.at)) }
        }),
      )
      return json({ counts })
    }

    const id = url.searchParams.get('id') ?? ''
    if (!ID_RE.test(id)) return json({ error: 'invalid id' }, 400)
    const raw = /** @type {string | null} */ (await redis(['GET', `board:${id}`]))
    if (!raw) return json({ error: 'not found' }, 404)
    const off = (await redis(['GET', `fboff:${id}`])) === '1'
    const key = `fb:${id}`

    switch (request.method) {
      case 'GET':
        return json({ on: !off, items: await itemsOf(id) })

      case 'POST': {
        if (off) return json({ error: 'feedback is off' }, 403)
        /** @type {any} */
        let body
        try {
          body = await request.json()
        } catch {
          return json({ error: 'invalid json' }, 400)
        }
        const by = person(body?.by)
        const target = String(body?.target ?? '')
        if (!by || !/^[\w-]{1,64}$/.test(target)) return json({ error: 'invalid feedback' }, 400)
        if (!(await allowFeedback(request))) return tooMuch()
        if (Number(await redis(['HLEN', key])) >= MAX_ITEMS) return json({ error: 'this board has a lot of feedback already' }, 409)
        let item
        if (body.kind === 'like') {
          // one like per person per item: liking again takes it back
          const field = `l:${target}:${by.id}`
          if (body.on === false) {
            await redis(['HDEL', key, field])
            return json({ removed: field })
          }
          item = { id: field, kind: 'like', target, by, at: Date.now() }
        } else if (body.kind === 'note') {
          const text = clean(body.text, MAX_TEXT)
          if (!text) return json({ error: 'empty note' }, 400)
          const nid = 'n' + [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14)
          item = { id: nid, kind: 'note', target, text, by, at: Date.now() }
        } else return json({ error: 'invalid feedback' }, 400)
        await redis(['HSET', key, item.id, JSON.stringify(item)])
        await redis(['EXPIRE', key, TTL_SECONDS])
        return json({ item })
      }

      case 'PATCH': {
        // only the owner (or an editor) may resolve notes or switch feedback off
        const editKey = request.headers.get('x-edit-key')
        const record = JSON.parse(raw)
        if (!editKey || editKey.length < 16 || !record.keyHash || (await sha256(editKey)) !== record.keyHash) return json({ error: 'view only' }, 403)
        /** @type {any} */
        let body
        try {
          body = await request.json()
        } catch {
          return json({ error: 'invalid json' }, 400)
        }
        if (typeof body?.on === 'boolean') {
          if (body.on) await redis(['DEL', `fboff:${id}`])
          else await redis(['SET', `fboff:${id}`, '1', 'EX', TTL_SECONDS])
        }
        if (Array.isArray(body?.resolve)) {
          for (const nid of body.resolve.slice(0, 100)) {
            if (typeof nid !== 'string' || !nid.startsWith('n')) continue
            const cur = /** @type {string | null} */ (await redis(['HGET', key, nid]))
            if (!cur) continue
            const item = JSON.parse(cur)
            await redis(['HSET', key, nid, JSON.stringify({ ...item, resolved: body.resolved !== false })])
          }
        }
        return json({ on: typeof body?.on === 'boolean' ? body.on : !off, items: await itemsOf(id) })
      }

      default:
        return json({ error: 'method not allowed' }, 405)
    }
  } catch (err) {
    console.error(err)
    return json({ error: 'storage unavailable' }, 502)
  }
}

export default { fetch: handle }
