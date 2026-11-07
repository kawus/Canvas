import { allowSignup, tooMuch } from './_limits.js'
import { json, redis, redisConfig, sha256 } from './_redis.js'

/**
 * "Send me rare updates about Canvas": the one place Canvas keeps an email
 * address, and only when someone ticks the box. Nothing else is stored with
 * it: no boards, no links, no device. The list lives in the Redis hash
 * `updates:list` (field = hash of the address, value = { email, at }), where
 * it can be read in the Upstash console when it's time to send an update.
 *
 *   POST /api/updates  { email }   → { ok: true }
 */

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/i

/** @param {Request} request */
export async function handle(request) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!redisConfig()) return json({ error: 'not set up' }, 503)
  /** @type {{ email?: unknown }} */
  let body
  try {
    body = /** @type {{ email?: unknown }} */ (JSON.parse((await request.text()).slice(0, 2000)))
  } catch {
    return json({ error: 'bad request' }, 400)
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (email.length > 254 || !EMAIL_RE.test(email)) return json({ error: 'that email address looks wrong' }, 400)
  if (!(await allowSignup(request))) return tooMuch()
  const field = (await sha256(`canvas-updates:${email}`)).slice(0, 32)
  // signing up twice keeps the first date
  await redis(['HSETNX', 'updates:list', field, JSON.stringify({ email, at: new Date().toISOString() })])
  return json({ ok: true })
}

export default { fetch: handle }
