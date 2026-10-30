/**
 * Canvas Pro: Stripe subscriptions without accounts.
 *
 * Paying gives the buyer a signed "Pro token" (kept in the browser, and in a
 * private Pro link to use on other devices). The token names the Stripe
 * customer; whether Pro is active is always checked with Stripe (cached briefly).
 *
 * Only STRIPE_SECRET_KEY is needed: the product and prices are created in
 * Stripe automatically on first use.
 *
 * Without it the paywall runs as a smoke test ("fake door"): the offer is
 * shown and interest is counted, but nobody is charged — choosing a plan
 * unlocks free early access (a "beta_" token). Set PRO_MODE=off for no paywall.
 */

import { redis, redisConfig, sha256 } from './_redis.js'

const STRIPE = () => process.env.STRIPE_API_BASE || 'https://api.stripe.com'
const secret = () => process.env.STRIPE_SECRET_KEY || ''

/** 'live' = real payments, 'smoke' = offer shown, no charge, 'off' = no paywall */
export const proMode = () => (secret() ? 'live' : process.env.PRO_MODE === 'off' ? 'off' : 'smoke')
export const paywallEnabled = () => proMode() !== 'off'

/** Prices in the smallest currency unit; adjustable without code changes. */
export function pricing() {
  return {
    currency: (process.env.PRO_CURRENCY || 'usd').toLowerCase(),
    month: Number(process.env.PRO_PRICE_MONTH || 600),
    year: Number(process.env.PRO_PRICE_YEAR || 4800),
  }
}

/**
 * Form-encode nested params the way Stripe expects (a[b][c]=v).
 * @param {Record<string, any>} obj
 * @returns {URLSearchParams}
 */
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (typeof v === 'object') form(v, key, out)
    else out.append(key, String(v))
  }
  return out
}

/**
 * @param {string} method
 * @param {string} path
 * @param {Record<string, any>} [params]
 * @returns {Promise<any>}
 */
export async function stripe(method, path, params) {
  const body = params && method !== 'GET' ? form(params) : undefined
  const query = params && method === 'GET' ? `?${form(params)}` : ''
  const res = await fetch(`${STRIPE()}/v1/${path}${query}`, {
    method,
    headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = /** @type {any} */ (await res.json())
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Stripe error ${res.status}`)
    // @ts-ignore attach for callers that need it
    err.stripe = data?.error
    throw err
  }
  return data
}

/** The recurring price for an interval, created on first use (found again by lookup key). */
/** @param {'month' | 'year'} interval */
export async function priceFor(interval) {
  const p = pricing()
  const lookup = `canvas_pro_${interval}_${p.currency}_${p[interval]}`
  const found = await stripe('GET', 'prices', { 'lookup_keys[]': lookup, active: 'true', limit: 1 })
  if (found.data?.length) return found.data[0].id
  const created = await stripe('POST', 'prices', {
    currency: p.currency,
    unit_amount: p[interval],
    recurring: { interval },
    lookup_key: lookup,
    product_data: { name: 'Canvas Pro' },
  })
  return created.id
}

/* ---------- Pro tokens ---------- */

const b64url = (/** @type {string} */ s) => Buffer.from(s).toString('base64url')

async function signature(/** @type {string} */ payload) {
  // early-access tokens stop working by themselves once real payments are set up
  const keyData = new TextEncoder().encode(
    await sha256(`canvas-pro:${secret() || process.env.LIVEBLOCKS_SECRET_KEY || 'canvas-early-access'}`),
  )
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Buffer.from(sig).toString('base64url')
}

/** @param {string} customer */
export async function makeToken(customer) {
  const payload = b64url(JSON.stringify({ c: customer, t: Date.now() }))
  return `${payload}.${await signature(payload)}`
}

/** @param {string | null | undefined} token  @returns {Promise<string | null>} customer id */
export async function verifyToken(token) {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig || (await signature(payload)) !== sig) return null
  try {
    const { c } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return typeof c === 'string' && (c.startsWith('cus_') || c.startsWith('beta_')) ? c : null
  } catch {
    return null
  }
}

/** Is this Stripe customer's subscription active? Cached for 10 minutes. */
/** @param {string} customer  @param {boolean} [fresh] */
export async function isActive(customer, fresh = false) {
  // early access during the smoke test
  if (customer.startsWith('beta_')) return proMode() === 'smoke'
  if (!secret()) return false
  const cacheKey = `pro:${customer}`
  if (!fresh && redisConfig()) {
    const cached = await redis(['GET', cacheKey]).catch(() => null)
    if (cached === '1' || cached === '0') return cached === '1'
  }
  const subs = await stripe('GET', 'subscriptions', { customer, status: 'all', limit: 10 })
  const active = (subs.data || []).some((/** @type {{status: string}} */ s) => ['active', 'trialing', 'past_due'].includes(s.status))
  if (redisConfig()) await redis(['SET', cacheKey, active ? '1' : '0', 'EX', 600]).catch(() => {})
  return active
}
