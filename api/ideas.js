/**
 * Ideas & requests: a small public roadmap on /changelog/.
 *
 *   GET    /api/ideas                     → { ideas }  (listed ideas with their votes)
 *   POST   /api/ideas  { kind: 'vote', id, device, on }        → { votes }
 *   POST   /api/ideas  { kind: 'suggest', title, text, email, device } → { ok, id }   (lands in the Inbox column)
 *
 * The owner (X-Admin-Key = IDEAS_ADMIN_KEY in Vercel) also gets:
 *   GET    /api/ideas?admin=1             → { ideas }  (with the email addresses people left)
 *   POST   /api/ideas  { kind: 'add', title, text, status }  → add an idea
 *   PATCH  /api/ideas  { id, status?, title?, text? }       → change an idea, or move it between columns
 *   DELETE /api/ideas?id=…                                  → remove an idea
 *
 * The board's columns, always in this order: Inbox (every new suggestion,
 * straight away), Planned, Working on, Delivered. No accounts: a vote is one
 * per device (a random id the browser keeps), and email addresses are never shown.
 */

import { allowFeedback, tooMuch } from './_limits.js'
import { ownerOnly } from './_owner.js'
import { json, redis, redisConfig, sha256 } from './_redis.js'

const STATUSES = ['inbox', 'planned', 'working', 'delivered']
const IDEAS = 'ideas'
const INBOX = 'ideas:inbox'
const votesKey = (/** @type {string} */ id) => `ideas:v:${id}`

/** The first ideas on the board (written once, then the owner manages them). */
const SEEDS = [
  { id: 'templates-more', title: 'More templates', text: 'Kitchen renovation and wedding moodboards, in the same calm layout as the others.', status: 'working' },
  { id: 'offline', title: 'Works offline', text: 'Open the Home Screen app without internet, on a plane or with bad signal; changes sync when you’re back online.', status: 'planned' },
  { id: 'history', title: 'Board history', text: 'See a board as it was yesterday, and restore it with one tap.', status: 'planned' },
  { id: 'straighten', title: 'Straighten rough shapes', text: 'Draw a rough circle, rectangle or line, hold still, and it becomes a clean shape.', status: 'delivered' },
  { id: 'focus', title: 'Focus mode', text: 'Hide every bar and button and keep only the board.', status: 'delivered' },
]

/** @param {unknown} v @param {number} max */
const clean = (v, max) =>
  String(v ?? '')
    .replace(/\p{Cc}/gu, (c) => (c === '\n' ? c : ''))
    .trim()
    .slice(0, max)

const newId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)

/** @param {string} key */
async function all(key) {
  const flat = /** @type {string[] | null} */ (await redis(['HGETALL', key])) ?? []
  const out = []
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try {
      out.push(JSON.parse(flat[i + 1]))
    } catch {
      /* skip */
    }
  }
  return out
}

async function listed() {
  if (!(await redis(['GET', 'ideas:seeded']))) {
    const now = Date.now()
    for (const [i, s] of SEEDS.entries()) await redis(['HSET', IDEAS, s.id, JSON.stringify({ ...s, created: now - i })])
    await redis(['SET', 'ideas:seeded', '1'])
  }
  // suggestions from before the Inbox column join the board, in the Inbox
  if (Number(await redis(['HLEN', INBOX])) > 0) {
    for (const old of await all(INBOX)) {
      await redis(['HSET', IDEAS, old.id, JSON.stringify({ id: old.id, title: old.title, text: old.text ?? '', status: 'inbox', created: old.created, ...(old.email ? { email: old.email } : {}) })])
      await redis(['HDEL', INBOX, old.id])
    }
  }
  const ideas = await all(IDEAS)
  const counts = await Promise.all(ideas.map((x) => redis(['SCARD', votesKey(x.id)])))
  return ideas.map((x, i) => ({ ...x, votes: Number(counts[i]) || 0 })).sort((a, b) => b.votes - a.votes || b.created - a.created)
}

/** @param {Request} request @returns {Promise<Response>} */
export async function handle(request) {
  if (!redisConfig()) return json({ error: 'cloud storage not configured' }, 503)
  const url = new URL(request.url)
  try {
    if (request.method === 'GET') {
      if (url.searchParams.get('admin')) {
        const no = await ownerOnly(request)
        if (no) return no
        return json({ ideas: await listed() })
      }
      // only what the public needs (never an email address)
      const ideas = (await listed()).map(({ id, title, text, status, votes, created }) => ({ id, title, text, status, votes, created }))
      return json({ ideas })
    }

    /** @type {any} */
    let body = {}
    if (request.method !== 'DELETE') {
      try {
        body = await request.json()
      } catch {
        return json({ error: 'invalid json' }, 400)
      }
    }

    if (request.method === 'POST' && body?.kind === 'vote') {
      const id = String(body.id ?? '')
      const device = String(body.device ?? '')
      if (!/^[\w-]{1,40}$/.test(id) || !/^[a-z0-9]{8,40}$/.test(device)) return json({ error: 'invalid vote' }, 400)
      if (!(await redis(['HGET', IDEAS, id]))) return json({ error: 'not found' }, 404)
      if (!(await allowFeedback(request))) return tooMuch()
      // one vote per device; the device id is stored scrambled
      const who = (await sha256(`canvas-idea:${device}`)).slice(0, 24)
      await redis([body.on === false ? 'SREM' : 'SADD', votesKey(id), who])
      return json({ votes: Number(await redis(['SCARD', votesKey(id)])) || 0 })
    }

    if (request.method === 'POST' && body?.kind === 'suggest') {
      const title = clean(body.title, 90).replace(/\s+/g, ' ')
      const text = clean(body.text, 500)
      const email = clean(body.email, 120)
      if (!title) return json({ error: 'empty idea' }, 400)
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'that email address doesn’t look right' }, 400)
      if (!(await allowFeedback(request))) return tooMuch()
      const waiting = (await all(IDEAS)).filter((x) => x.status === 'inbox').length
      if (waiting >= 300) return json({ error: 'the inbox is full for now' }, 409)
      const id = newId()
      await redis(['HSET', IDEAS, id, JSON.stringify({ id, title, text, status: 'inbox', ...(email ? { email } : {}), created: Date.now() })])
      // whoever suggested it counts as its first vote
      const device = String(body.device ?? '')
      if (/^[a-z0-9]{8,40}$/.test(device)) await redis(['SADD', votesKey(id), (await sha256(`canvas-idea:${device}`)).slice(0, 24)])
      return json({ ok: true, id })
    }

    // everything below is for the owner
    const no = await ownerOnly(request)
    if (no) return no

    if (request.method === 'POST' && body?.kind === 'add') {
      const title = clean(body.title, 90).replace(/\s+/g, ' ')
      if (!title) return json({ error: 'empty idea' }, 400)
      const status = STATUSES.includes(body.status) ? body.status : 'planned'
      const id = newId()
      await redis(['HSET', IDEAS, id, JSON.stringify({ id, title, text: clean(body.text, 500), status, created: Date.now() })])
      return json({ ok: true, id })
    }

    if (request.method === 'PATCH') {
      const id = String(body?.id ?? '')
      const raw = /** @type {string | null} */ (await redis(['HGET', IDEAS, id]))
      if (!raw) return json({ error: 'not found' }, 404)
      const idea = JSON.parse(raw)
      if (STATUSES.includes(body.status)) {
        idea.status = body.status
        if (body.status === 'delivered' && !idea.delivered) idea.delivered = Date.now()
      }
      if (typeof body.title === 'string' && clean(body.title, 90)) idea.title = clean(body.title, 90)
      if (typeof body.text === 'string') idea.text = clean(body.text, 500)
      await redis(['HSET', IDEAS, id, JSON.stringify(idea)])
      return json({ ok: true })
    }

    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id) return json({ error: 'nothing to remove' }, 400)
      await redis(['HDEL', IDEAS, id])
      await redis(['DEL', votesKey(id)])
      return json({ ok: true })
    }

    return json({ error: 'method not allowed' }, 405)
  } catch (err) {
    console.error(err)
    return json({ error: 'storage unavailable' }, 502)
  }
}

export default { fetch: handle }
