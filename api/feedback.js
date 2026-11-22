/**
 * Feedback on shared boards: likes and short notes from anyone with the link.
 * There are no accounts: people give a name, and the board's owner (whoever
 * holds its edit key) resolves notes or switches feedback off.
 *
 *   GET   /api/feedback?id=<board>[&v=<n>]   → { on, items, v }, or { unchanged, v } when nothing changed since version n
 *   GET   /api/feedback?ids=<a>,<b>,…        → { counts: { <id>: { open, latest } } }  (for the boards list)
 *   POST  /api/feedback?id=<board>           → like:  { kind: 'like', target, by, on }
 *                                              note:  { kind: 'note', target, text, by }
 *                                              reply: { kind: 'reply', parent, text, by }  (one short line under a note)
 *   PATCH /api/feedback?id=<board>           (X-Edit-Key) → { resolve: [ids], resolved } or { on }
 *
 * Feedback is kept apart from the board itself, so leaving a note never needs
 * (or touches) the edit key, and it disappears with the board.
 *
 * People are sent with their device's id, but what's stored and shown is a
 * scrambled id that's different on every board (`publicId`): nobody reading a
 * board's notes can act as someone else or recognise them on another board.
 */

import { allowFeedback, tooMuch } from './_limits.js'
import { json, redis, redisConfig, sha256 } from './_redis.js'

const ID_RE = /^[a-z0-9]{6,32}$/
const TTL_SECONDS = 60 * 60 * 24 * 365
const MAX_ITEMS = 500
const MAX_TEXT = 280
const MAX_REPLY = 140
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

/** What a person's id becomes on one board: scrambled, and different on every board. @param {string} board @param {string} device */
const publicId = async (board, device) => (await sha256(`canvas-fb:${board}:${device}`)).slice(0, 16)
const PUBLIC_RE = /^[0-9a-f]{16}$/

/** All feedback on a board, as stored (field → JSON). Older items, stored with the device's own id, are scrambled on the way. */
async function itemsOf(/** @type {string} */ id) {
  const key = `fb:${id}`
  const flat = /** @type {string[] | null} */ (await redis(['HGETALL', key])) ?? []
  const out = []
  let changed = false
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try {
      const x = JSON.parse(flat[i + 1])
      if (x.by && typeof x.by.id === 'string' && !PUBLIC_RE.test(x.by.id)) {
        x.by = { ...x.by, id: await publicId(id, x.by.id) }
        if (x.kind === 'like') {
          await redis(['HDEL', key, flat[i]])
          x.id = `l:${x.target}:${x.by.id}`
        }
        await redis(['HSET', key, x.id, JSON.stringify(x)])
        changed = true
      }
      out.push(x)
    } catch {
      /* skip */
    }
  }
  // open boards download again (they only do when the version changes)
  if (changed) await redis(['INCR', `fbv:${id}`])
  return out.sort((a, b) => a.at - b.at)
}

/** Whether this edit key belongs to the board (owner or editor). @param {string} raw @param {string | null} editKey */
async function holdsKey(raw, editKey) {
  if (!editKey || editKey.length < 16) return false
  const record = JSON.parse(raw)
  return !!record.keyHash && (await sha256(editKey)) === record.keyHash
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
          const openIds = new Set(open.map((x) => x.id))
          // a new reply on an open note counts as news too
          const replies = items.filter((x) => x.kind === 'reply' && openIds.has(x.parent))
          if (open.length) counts[b] = { open: open.length, latest: Math.max(...open.map((x) => x.at), ...replies.map((x) => x.at)) }
        }),
      )
      return json({ counts })
    }

    const id = url.searchParams.get('id') ?? ''
    if (!ID_RE.test(id)) return json({ error: 'invalid id' }, 400)
    const key = `fb:${id}`
    const vkey = `fbv:${id}`
    // every change bumps the board's feedback version, so open boards can check often for very little
    const bump = async () => {
      await redis(['INCR', vkey])
      await redis(['EXPIRE', vkey, TTL_SECONDS])
    }

    if (request.method === 'GET') {
      const v = Number((await redis(['GET', vkey])) ?? 0)
      const known = url.searchParams.get('v')
      if (known !== null && Number(known) === v) return json({ unchanged: true, v })
      if (!Number(await redis(['EXISTS', `board:${id}`]))) return json({ error: 'not found' }, 404)
      const off = (await redis(['GET', `fboff:${id}`])) === '1'
      return json({ on: !off, items: await itemsOf(id), v })
    }

    const raw = /** @type {string | null} */ (await redis(['GET', `board:${id}`]))
    if (!raw) return json({ error: 'not found' }, 404)
    const off = (await redis(['GET', `fboff:${id}`])) === '1'

    switch (request.method) {
      case 'POST': {
        // switched off: only the owner (or an editor) can still add notes
        if (off && !(await holdsKey(raw, request.headers.get('x-edit-key')))) return json({ error: 'feedback is off' }, 403)
        /** @type {any} */
        let body
        try {
          body = await request.json()
        } catch {
          return json({ error: 'invalid json' }, 400)
        }
        const sender = person(body?.by)
        // what's stored and shown: the scrambled id for this board (the device's own id is only used to make it)
        const by = sender && { ...sender, id: await publicId(id, sender.id) }
        let target = String(body?.target ?? '')
        /** @type {any} */
        let parent = null
        if (body?.kind === 'reply') {
          // a reply lives under its note (and on the same item)
          const raw = typeof body.parent === 'string' && /^n[a-z0-9]{6,20}$/.test(body.parent) ? /** @type {string | null} */ (await redis(['HGET', key, body.parent])) : null
          parent = raw ? JSON.parse(raw) : null
          if (!parent || parent.kind !== 'note' || parent.resolved) return json({ error: 'that note is gone' }, 404)
          target = parent.target
        }
        if (!by || !/^[\w-]{1,64}$/.test(target)) return json({ error: 'invalid feedback' }, 400)
        if (!(await allowFeedback(request))) return tooMuch()
        if (Number(await redis(['HLEN', key])) >= MAX_ITEMS) return json({ error: 'this board has a lot of feedback already' }, 409)
        let item
        if (body.kind === 'like') {
          // one like per person per item: liking again takes it back
          const field = `l:${target}:${by.id}`
          // (and any like stored before ids were scrambled; never for an id that looks scrambled,
          // or the id shown on the board could be used to remove someone's like)
          const raw = /** @type {{ id: string }} */ (sender).id
          const fields = PUBLIC_RE.test(raw) ? [field] : [field, `l:${target}:${raw}`]
          if (body.on === false) {
            await redis(['HDEL', key, ...fields])
            await bump()
            return json({ removed: field })
          }
          if (fields.length > 1) await redis(['HDEL', key, fields[1]])
          item = { id: field, kind: 'like', target, by, at: Date.now() }
        } else if (body.kind === 'note') {
          const text = clean(body.text, MAX_TEXT)
          if (!text) return json({ error: 'empty note' }, 400)
          const nid = 'n' + [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14)
          item = { id: nid, kind: 'note', target, text, by, at: Date.now() }
        } else if (body.kind === 'reply') {
          const text = clean(body.text, MAX_REPLY).replace(/\s+/g, ' ')
          if (!text) return json({ error: 'empty reply' }, 400)
          const rid = 'r' + [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14)
          item = { id: rid, kind: 'reply', parent: parent.id, target, text, by, at: Date.now() }
        } else return json({ error: 'invalid feedback' }, 400)
        await redis(['HSET', key, item.id, JSON.stringify(item)])
        await redis(['EXPIRE', key, TTL_SECONDS])
        await bump()
        return json({ item })
      }

      case 'PATCH': {
        // only the owner (or an editor) may resolve notes or switch feedback off
        if (!(await holdsKey(raw, request.headers.get('x-edit-key')))) return json({ error: 'view only' }, 403)
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
        await bump()
        return json({ on: typeof body?.on === 'boolean' ? body.on : !off, items: await itemsOf(id), v: Number(await redis(['GET', vkey])) })
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
