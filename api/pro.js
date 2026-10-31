/**
 * Canvas Pro endpoints (see _pro.js).
 *
 *   GET  /api/pro?action=config                  → { enabled, currency, month, year }
 *   GET  /api/pro?action=status    (X-Pro-Token) → { pro }
 *   POST /api/pro?action=checkout  { interval, returnUrl }        → { url }  (Stripe Checkout)
 *   POST /api/pro?action=claim     { session }                    → { token } after paying
 *   POST /api/pro?action=portal    (X-Pro-Token) { returnUrl }    → { url }  (manage / cancel)
 *
 * Smoke test (no Stripe key yet):
 *   POST /api/pro?action=track     { event, device }              count interest
 *   POST /api/pro?action=beta      { interval, device }           → { token } free early access
 *   GET  /api/pro?action=stats                                    → interest so far
 */

import { isActive, makeToken, paywallEnabled, priceFor, pricing, proMode, stripe, verifyToken } from './_pro.js'
import { json, redis, redisConfig } from './_redis.js'

/* ---------- Smoke-test analytics (counts only; devices are anonymous ids) ---------- */

const EVENTS = ['locked', 'view', 'intent_month', 'intent_year']
const DEVICE_RE = /^[a-z0-9]{8,40}$/
const day = (offset = 0) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)

/** @param {string} event @param {unknown} device */
async function track(event, device) {
  if (!EVENTS.includes(event) || !redisConfig()) return
  await redis(['INCR', `stats:all:${event}`])
  await redis(['INCR', `stats:${day()}:${event}`])
  await redis(['EXPIRE', `stats:${day()}:${event}`, 60 * 60 * 24 * 120])
  // unique devices, counted with a HyperLogLog (no list of ids is kept)
  if (typeof device === 'string' && DEVICE_RE.test(device)) await redis(['PFADD', `stats:uniq:${event}`, device])
}

async function stats() {
  /** @type {Record<string, { total: number, people: number, last7: number }>} */
  const out = {}
  const days = Array.from({ length: 7 }, (_, i) => day(i))
  for (const e of EVENTS) {
    const total = Number((await redis(['GET', `stats:all:${e}`])) || 0)
    const people = Number((await redis(['PFCOUNT', `stats:uniq:${e}`])) || 0)
    const week = /** @type {(string | null)[]} */ (await redis(['MGET', ...days.map((d) => `stats:${d}:${e}`)]))
    out[e] = { total, people, last7: week.reduce((sum, v) => sum + Number(v || 0), 0) }
  }
  return out
}

/**
 * Board sync usage: each device tallies its "anything new?" checks and reports
 * them in batches, so counting doesn't add a database request per check.
 * @param {unknown} checks @param {unknown} changed @param {unknown} device
 */
async function recordUsage(checks, changed, device) {
  const n = Math.floor(Number(checks))
  const c = Math.floor(Number(changed))
  if (!redisConfig() || !(n > 0 && n <= 100_000)) return
  const keep = 60 * 60 * 24 * 120
  const k = `usage:${day()}`
  await redis(['INCRBY', `${k}:checks`, n])
  await redis(['EXPIRE', `${k}:checks`, keep])
  if (c > 0 && c <= n) {
    await redis(['INCRBY', `${k}:changed`, c])
    await redis(['EXPIRE', `${k}:changed`, keep])
  }
  if (typeof device === 'string' && DEVICE_RE.test(device)) {
    await redis(['PFADD', `${k}:devices`, device])
    await redis(['EXPIRE', `${k}:devices`, keep])
  }
}

/** The last 30 days of board sync usage, newest last. */
async function usage() {
  const days = Array.from({ length: 30 }, (_, i) => day(29 - i))
  const checks = /** @type {(string | null)[]} */ (await redis(['MGET', ...days.map((d) => `usage:${d}:checks`)]))
  const changed = /** @type {(string | null)[]} */ (await redis(['MGET', ...days.map((d) => `usage:${d}:changed`)]))
  /** @type {number[]} */
  const devices = []
  for (const d of days.slice(-14)) devices.push(Number((await redis(['PFCOUNT', `usage:${d}:devices`])) || 0))
  return days.map((d, i) => ({
    day: d,
    checks: Number(checks[i] || 0),
    changed: Number(changed[i] || 0),
    devices: i >= 16 ? devices[i - 16] : null,
  }))
}

/** Only send people back to this app. @param {Request} request @param {unknown} url */
function safeReturn(request, url) {
  const origin = new URL(request.url).origin
  try {
    const u = new URL(String(url))
    if (u.origin === origin) return u
  } catch {
    /* fall through */
  }
  return new URL(`${origin}/`)
}

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handle(request) {
  const action = new URL(request.url).searchParams.get('action')
  if (action === 'config') return json({ enabled: paywallEnabled(), mode: proMode(), ...pricing() })
  if (!paywallEnabled()) return json({ error: 'payments not configured' }, 503)

  try {
    if (action === 'stats') {
      if (!redisConfig()) return json({ error: 'cloud storage not configured' }, 503)
      return json({ mode: proMode(), events: await stats(), usage: await usage() })
    }
    const token = request.headers.get('x-pro-token')
    if (action === 'status') {
      const customer = await verifyToken(token)
      return json({ pro: !!customer && (await isActive(customer)) })
    }
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)
    const body = /** @type {Record<string, unknown>} */ (await request.json().catch(() => ({})))

    if (action === 'track') {
      await track(String(body.event), body.device)
      return new Response(null, { status: 204 })
    }

    if (action === 'usage') {
      await recordUsage(body.checks, body.changed, body.device)
      return new Response(null, { status: 204 })
    }

    if (action === 'beta') {
      // smoke test: count the intent to buy, then unlock early access for free
      if (proMode() !== 'smoke') return json({ error: 'not available' }, 400)
      const interval = body.interval === 'year' ? 'year' : 'month'
      await track(`intent_${interval}`, body.device)
      const device = typeof body.device === 'string' && DEVICE_RE.test(body.device) ? body.device : 'anon'
      return json({ token: await makeToken(`beta_${device}`) })
    }

    if (proMode() !== 'live') return json({ error: 'payments not set up yet' }, 400)

    if (action === 'checkout') {
      const interval = body.interval === 'year' ? 'year' : 'month'
      const back = safeReturn(request, body.returnUrl)
      const success = new URL(back)
      success.searchParams.set('pro_session', '{CHECKOUT_SESSION_ID}')
      const session = await stripe('POST', 'checkout/sessions', {
        mode: 'subscription',
        line_items: { 0: { price: await priceFor(interval), quantity: 1 } },
        allow_promotion_codes: 'true',
        // keep {CHECKOUT_SESSION_ID} literal for Stripe to fill in
        success_url: success.toString().replace(encodeURIComponent('{CHECKOUT_SESSION_ID}'), '{CHECKOUT_SESSION_ID}'),
        cancel_url: back.toString(),
      })
      return json({ url: session.url })
    }

    if (action === 'claim') {
      const id = String(body.session || '')
      if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json({ error: 'invalid session' }, 400)
      const session = await stripe('GET', `checkout/sessions/${id}`)
      if (session.status !== 'complete' || typeof session.customer !== 'string') {
        return json({ error: 'payment not completed' }, 402)
      }
      await isActive(session.customer, true)
      return json({ token: await makeToken(session.customer) })
    }

    if (action === 'portal') {
      const customer = await verifyToken(token)
      if (!customer) return json({ error: 'not pro' }, 403)
      const return_url = safeReturn(request, body.returnUrl).toString()
      try {
        const portal = await stripe('POST', 'billing_portal/sessions', { customer, return_url })
        return json({ url: portal.url })
      } catch {
        // first use: the customer portal needs a configuration, so create a simple one
        const config = await stripe('POST', 'billing_portal/configurations', {
          features: {
            subscription_cancel: { enabled: 'true' },
            payment_method_update: { enabled: 'true' },
            invoice_history: { enabled: 'true' },
          },
        })
        const portal = await stripe('POST', 'billing_portal/sessions', { customer, return_url, configuration: config.id })
        return json({ url: portal.url })
      }
    }

    return json({ error: 'unknown action' }, 400)
  } catch (err) {
    console.error(err)
    return json({ error: 'payments unavailable' }, 502)
  }
}

export default { fetch: handle }
