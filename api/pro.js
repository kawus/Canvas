/**
 * Canvas Pro endpoints (see _pro.js).
 *
 *   GET  /api/pro?action=config                  → { enabled, currency, month, year }
 *   GET  /api/pro?action=status    (X-Pro-Token) → { pro }
 *   POST /api/pro?action=checkout  { interval, returnUrl }        → { url }  (Stripe Checkout)
 *   POST /api/pro?action=claim     { session }                    → { token } after paying
 *   POST /api/pro?action=portal    (X-Pro-Token) { returnUrl }    → { url }  (manage / cancel)
 */

import { isActive, makeToken, paywallEnabled, priceFor, pricing, stripe, verifyToken } from './_pro.js'
import { json } from './_redis.js'

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
  if (action === 'config') return json({ enabled: paywallEnabled(), ...pricing() })
  if (!paywallEnabled()) return json({ error: 'payments not configured' }, 503)

  try {
    const token = request.headers.get('x-pro-token')
    if (action === 'status') {
      const customer = await verifyToken(token)
      return json({ pro: !!customer && (await isActive(customer)) })
    }
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)
    const body = /** @type {Record<string, unknown>} */ (await request.json().catch(() => ({})))

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
