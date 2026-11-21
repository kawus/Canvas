/**
 * Ideas & requests: a small public roadmap on /changelog/.
 *
 *   GET    /api/ideas                     → { ideas }  (listed ideas with their votes)
 *   POST   /api/ideas  { kind: 'vote', id, device, on }        → { votes }
 *   POST   /api/ideas  { kind: 'suggest', title, text, email } → { ok }   (goes to the private inbox)
 *
 * The owner (X-Admin-Key = IDEAS_ADMIN_KEY in Vercel) also gets:
 *   GET    /api/ideas?admin=1             → { ideas, inbox }
 *   POST   /api/ideas  { kind: 'add', title, text, status, from? }  → add an idea (from an inbox item, or new)
 *   PATCH  /api/ideas  { id, status?, title?, text? }               → change an idea
 *   DELETE /api/ideas?id=… | ?inbox=…                               → remove an idea / dismiss a suggestion
 *
 * No accounts: a vote is one per device (a random id the browser keeps), and
 * suggestions only appear publicly once the owner adds them.
 */

import { allowFeedback, tooMuch } from './_limits.js'
import { json, redis, redisConfig, sha256 } from './_redis.js'

const STATUSES = ['planned', 'working', 'delivered']
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

/** The owner's key from Vercel (spaces around it, from pasting, don't count). */
const adminKey = () => (process.env.IDEAS_ADMIN_KEY || '').trim()
/** At least 12 characters, so the owner's page can't be guessed. */
const adminReady = () => adminKey().length >= 12

/** @param {Request} request */
function isOwner(request) {
  const got = (request.headers.get('x-admin-key') || '').trim()
  return adminReady() && got === adminKey()
}

/** Why the owner's key was refused: not set up in Vercel yet, or a different key. */
const refused = () =>
  adminReady()
    ? json({ error: 'wrong key', reason: 'wrong-key' }, 403)
    : json({ error: 'not set up', reason: adminKey() ? 'too-short' : 'missing' }, 403)

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
        if (!isOwner(request)) return refused()
        const inbox = (await all(INBOX)).sort((a, b) => b.created - a.created)
        return json({ ideas: await listed(), inbox })
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
      if (Number(await redis(['HLEN', INBOX])) >= 500) return json({ error: 'the inbox is full for now' }, 409)
      const id = newId()
      await redis(['HSET', INBOX, id, JSON.stringify({ id, title, text, ...(email ? { email } : {}), created: Date.now() })])
      return json({ ok: true })
    }

    // everything below is for the owner
    if (!isOwner(request)) return refused()

    if (request.method === 'POST' && body?.kind === 'add') {
      const title = clean(body.title, 90).replace(/\s+/g, ' ')
      if (!title) return json({ error: 'empty idea' }, 400)
      const status = STATUSES.includes(body.status) ? body.status : 'planned'
      const id = newId()
      await redis(['HSET', IDEAS, id, JSON.stringify({ id, title, text: clean(body.text, 300), status, created: Date.now() })])
      // added from a suggestion: it leaves the inbox (and whoever suggested it counts as its first vote)
      if (typeof body.from === 'string' && body.from) {
        await redis(['HDEL', INBOX, body.from])
        await redis(['SADD', votesKey(id), `suggested:${body.from}`])
      }
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
      if (typeof body.text === 'string') idea.text = clean(body.text, 300)
      await redis(['HSET', IDEAS, id, JSON.stringify(idea)])
      return json({ ok: true })
    }

    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id')
      const inbox = url.searchParams.get('inbox')
      if (id) {
        await redis(['HDEL', IDEAS, id])
        await redis(['DEL', votesKey(id)])
      } else if (inbox) await redis(['HDEL', INBOX, inbox])
      else return json({ error: 'nothing to remove' }, 400)
      return json({ ok: true })
    }

    return json({ error: 'method not allowed' }, 405)
  } catch (err) {
    console.error(err)
    return json({ error: 'storage unavailable' }, 502)
  }
}

export default { fetch: handle }
