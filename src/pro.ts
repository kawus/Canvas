import { getMe } from './collab'
import { useStore } from './store'

/**
 * Canvas Pro on the client. There are no accounts: after paying, the browser
 * keeps a signed Pro token, and your My Canvas link carries it to other devices.
 * The server checks with Stripe whether the subscription is active.
 */

const TOKEN_KEY = 'canvas-pro'

export interface ProConfig {
  enabled: boolean
  /** 'live' = real payments, 'smoke' = offer shown but free early access, 'off' = no paywall */
  mode: 'live' | 'smoke' | 'off'
  currency: string
  month: number
  year: number
}

export function proToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

/** Told when the Pro token changes (the "My Canvas" backup carries it to other devices). */
let tokenListener: (() => void) | null = null
export function onProTokenChange(fn: () => void) {
  tokenListener = fn
}

export function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
  tokenListener?.()
}

let configPromise: Promise<ProConfig> | null = null

export function proConfig() {
  configPromise ??= fetch('api/pro?action=config', { cache: 'no-store' })
    .then(async (r) => {
      if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error('no pro api')
      return (await r.json()) as ProConfig
    })
    .catch((): ProConfig => ({ enabled: false, mode: 'off', currency: 'usd', month: 0, year: 0 }))
  return configPromise
}

async function post<T>(action: string, body: unknown): Promise<T> {
  const token = proToken()
  const res = await fetch(`api/pro?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Pro-Token': token } : {}) },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || 'Payments are unavailable')
  return data
}

/** Learn whether payments are set up and whether this device has Pro. */
export async function refreshPro() {
  const cfg = await proConfig()
  const s = useStore.getState()
  if (!cfg.enabled) {
    s.setPro({ paywall: false, active: false, config: cfg })
    return
  }
  const token = proToken()
  let active = false
  if (token) {
    try {
      const res = await fetch('api/pro?action=status', { headers: { 'X-Pro-Token': token }, cache: 'no-store' })
      active = !!((await res.json()) as { pro?: boolean }).pro
    } catch {
      active = useStore.getState().pro.active
    }
  }
  useStore.getState().setPro({ paywall: true, active, config: cfg })
}

/** Smoke test: count interest in the offer (anonymous device id only). */
export function track(event: 'locked' | 'view') {
  void post('track', { event, device: getMe().id }).catch(() => {})
}

/** Smoke test: "buying" records the choice and unlocks free early access. */
export async function joinEarlyAccess(interval: 'month' | 'year') {
  const { token } = await post<{ token: string }>('beta', { interval, device: getMe().id })
  saveToken(token)
  await refreshPro()
}

export async function startCheckout(interval: 'month' | 'year') {
  const { url } = await post<{ url: string }>('checkout', { interval, returnUrl: location.href })
  location.href = url
}

export async function openPortal() {
  const { url } = await post<{ url: string }>('portal', { returnUrl: location.href })
  location.href = url
}

/** Back from Stripe Checkout (?pro_session=…): exchange the session for a Pro token. */
export async function claimFromUrl() {
  const params = new URLSearchParams(location.search)
  const session = params.get('pro_session')
  if (!session) return
  params.delete('pro_session')
  const query = params.toString()
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`)
  try {
    const { token } = await post<{ token: string }>('claim', { session })
    saveToken(token)
    await refreshPro()
    useStore.getState().showToast('Welcome to Canvas Pro ✦')
  } catch {
    useStore.getState().showToast('We couldn’t confirm the payment yet — try reloading in a moment')
  }
}

/** Opening a Pro link (#pro=…) on another device. */
export async function activateProLink(token: string) {
  saveToken(token)
  await refreshPro()
  useStore.getState().showToast(useStore.getState().pro.active ? 'Pro is active on this device' : 'That Pro link isn’t active')
}

export function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: amount % 100 ? 2 : 0,
  }).format(amount / 100)
}
