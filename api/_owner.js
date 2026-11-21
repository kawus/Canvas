/**
 * The owner's key (IDEAS_ADMIN_KEY in Vercel): it opens the Ideas board's owner
 * view (/changelog/?admin) and the Pro numbers (/#stats).
 *
 * Wrong keys are counted per visitor (by a scrambled internet address, like the
 * fair-use limits), and after 10 wrong tries in an hour every try is refused
 * until the hour is up, so the key can't be guessed by trying again and again.
 */

import { timingSafeEqual } from 'node:crypto'
import { redis, redisConfig, json, sha256 } from './_redis.js'

const MAX_WRONG = 10
const WINDOW = 3600

/** The owner's key from Vercel (spaces around it, from pasting, don't count). */
const ownerKey = () => (process.env.IDEAS_ADMIN_KEY || '').trim()
/** At least 12 characters, so it can't be guessed. */
const ready = () => ownerKey().length >= 12

/** @param {Request} request */
async function wrongKey(request) {
  const ip = request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  const who = (await sha256(`canvas-visitor:${ip}`)).slice(0, 20)
  return `limit:owner-wrong:${Math.floor(Date.now() / 1000 / WINDOW)}:${who}`
}

/** Same length and same characters, compared in constant time. @param {string} a @param {string} b */
function same(a, b) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * null when the request carries the owner's key, otherwise the response to send.
 * @param {Request} request
 * @returns {Promise<Response | null>}
 */
export async function ownerOnly(request) {
  if (!ready()) return json({ error: 'not set up', reason: ownerKey() ? 'too-short' : 'missing' }, 403)
  const got = (request.headers.get('x-admin-key') || '').trim()
  const counter = redisConfig() ? await wrongKey(request) : null
  if (counter && Number(await redis(['GET', counter]).catch(() => 0)) >= MAX_WRONG) {
    return json({ error: 'too many wrong keys, try again in an hour', reason: 'locked' }, 429)
  }
  if (got && same(got, ownerKey())) return null
  if (counter && got) {
    const n = Number(await redis(['INCR', counter]).catch(() => 0))
    if (n === 1) await redis(['EXPIRE', counter, WINDOW + 60]).catch(() => {})
  }
  return json({ error: 'wrong key', reason: 'wrong-key' }, 403)
}

/** Whether the request carries the owner's key (for pages that show more to the owner). @param {Request} request */
export async function isOwner(request) {
  if (!request.headers.get('x-admin-key')) return false
  return (await ownerOnly(request)) === null
}
