/**
 * Tiny Upstash Redis REST client shared by the API functions.
 * Files starting with "_" are not deployed as their own endpoints.
 */

export function redisConfig() {
  const env = process.env
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url: url.replace(/\/$/, ''), token } : null
}

/** @param {(string | number)[]} cmd */
export async function redis(cmd) {
  const cfg = /** @type {{ url: string, token: string }} */ (redisConfig())
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  })
  const data = /** @type {{ result?: unknown, error?: string }} */ (await res.json())
  if (!res.ok || data.error) throw new Error(data.error || `Redis error ${res.status}`)
  return data.result
}

/**
 * @param {unknown} body
 * @param {number} [status]
 */
export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/** Hex SHA-256 of a string. @param {string} text */
export async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
