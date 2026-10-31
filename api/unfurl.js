/**
 * Link previews and web images for moodboards.
 *
 *   GET /api/unfurl?url=<page>     → { url, title, description, site, image }   (Open Graph tags)
 *   GET /api/unfurl?image=<image>  → data URL of the image (text)
 *
 * Browsers can't read other sites directly, so the app asks this function.
 * Only public http(s) addresses are fetched, with a size and time limit.
 */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { json } from './_redis.js'

const PAGE_LIMIT = 600_000
const IMAGE_LIMIT = 6_000_000
const TIMEOUT = 7000
// identify honestly; sites that don't want automated visits just get a plain card
const UA = 'CanvasLinkPreview/1.0 (+https://github.com/kawus/Canvas)'

/** An IPv4 or IPv6 address that isn't on the public internet. @param {string} ip */
function privateIp(ip) {
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
    )
  }
  const v6 = ip.toLowerCase()
  // IPv4 written as IPv6 (::ffff:127.0.0.1, or ::ffff:7f00:1)
  const mapped = /^::ffff:(?:0:)?(.+)$/.exec(v6)
  if (mapped) {
    const rest = mapped[1]
    if (rest.includes('.')) return privateIp(rest)
    const [hi, lo] = rest.split(':').map((h) => parseInt(h, 16))
    return privateIp([hi >> 8, hi & 255, lo >> 8, lo & 255].join('.'))
  }
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('ff') || v6.startsWith('64:ff9b')
}

/** Refuse anything that isn't a public web address. @param {string} raw */
function publicUrl(raw) {
  let u
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null
  if (isIP(host) && privateIp(host)) return null
  return u
}

/** Also check what the name points to, so a public-looking name can't lead inside. @param {URL} u */
async function resolvesPublic(u) {
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) return !privateIp(host)
  try {
    const addrs = await lookup(host, { all: true })
    return addrs.length > 0 && addrs.every((a) => !privateIp(a.address))
  } catch {
    return false
  }
}

/**
 * fetch() that only ever talks to public addresses: every redirect is followed
 * by hand and checked again (a public page can't bounce us into a private network).
 * @param {URL} start @param {RequestInit} init
 */
async function publicFetch(start, init) {
  let url = start
  for (let hop = 0; hop < 5; hop++) {
    if (!(await resolvesPublic(url))) throw new Error('not a public address')
    const res = await fetch(url, { ...init, redirect: 'manual' })
    const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (!next) return { res, url }
    const target = publicUrl(new URL(next, url).href)
    if (!target) throw new Error('redirect to a non-public address')
    url = target
  }
  throw new Error('too many redirects')
}

/** Read at most `limit` bytes of a response body. @param {Response} res @param {number} limit */
async function readLimited(res, limit) {
  const reader = res.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
    if (size > limit) {
      await reader.cancel().catch(() => {})
      break
    }
  }
  const out = new Uint8Array(Math.min(size, limit))
  let offset = 0
  for (const c of chunks) {
    const part = c.subarray(0, Math.min(c.length, out.length - offset))
    out.set(part, offset)
    offset += part.length
    if (offset >= out.length) break
  }
  return out
}

/** @param {string} s */
const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()

/** Content of <meta property|name="…" content="…"> in either attribute order. @param {string} html @param {string[]} names */
function meta(html, names) {
  for (const name of names) {
    const n = name.replace(/[:.]/g, '\\$&')
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, 'i')
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, 'i')
    const m = html.match(re1) || html.match(re2)
    if (m?.[1]) return decode(m[1])
  }
  return ''
}

/** Video sites block server visits but offer oEmbed for previews. @param {URL} url */
async function oembed(url) {
  const host = url.hostname.replace(/^www\./, '')
  let api = ''
  let site = ''
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) {
    api = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.href)}`
    site = 'YouTube'
  } else if (/(^|\.)vimeo\.com$/.test(host)) {
    api = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url.href)}`
    site = 'Vimeo'
  } else return null
  const res = await fetch(api, { signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) return null
  const d = /** @type {{ title?: string, author_name?: string, thumbnail_url?: string }} */ (await res.json())
  return { url: url.href, title: d.title || '', description: d.author_name || '', site, image: d.thumbnail_url || '' }
}

/** @param {URL} url */
async function preview(url) {
  const embedded = await oembed(url).catch(() => null)
  if (embedded) return embedded
  const empty = { url: url.href, title: '', description: '', site: url.hostname.replace(/^www\./, ''), image: '' }
  const { res, url: landed } = await publicFetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(TIMEOUT),
  })
  // blocked, or bounced to a bot check on another site: fall back to a plain card
  if (!res.ok) return empty
  let finalUrl = landed
  if (finalUrl.hostname.replace(/^www\./, '') !== url.hostname.replace(/^www\./, '') && /sorry|captcha|challenge|login/i.test(finalUrl.pathname)) {
    return empty
  }
  if (finalUrl.hostname !== url.hostname) finalUrl = url
  const type = res.headers.get('content-type') || ''
  // a direct link to an image
  if (type.startsWith('image/')) return { url: finalUrl.href, title: '', description: '', site: finalUrl.hostname, image: finalUrl.href, isImage: true }
  const html = new TextDecoder().decode(await readLimited(res, PAGE_LIMIT))
  const title = meta(html, ['og:title', 'twitter:title']) || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '')
  const description = meta(html, ['og:description', 'twitter:description', 'description'])
  const site = meta(html, ['og:site_name', 'application-name']) || finalUrl.hostname.replace(/^www\./, '')
  let image = meta(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'])
  if (image) {
    try {
      image = new URL(image, finalUrl).href
    } catch {
      image = ''
    }
  }
  return {
    url: finalUrl.href,
    title: title.slice(0, 300),
    description: description.slice(0, 500),
    site: site.slice(0, 100),
    image,
  }
}

/** @param {URL} url */
async function imageData(url) {
  const { res } = await publicFetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*' }, signal: AbortSignal.timeout(TIMEOUT) })
  const type = (res.headers.get('content-type') || '').split(';')[0].trim()
  if (!res.ok || !/^image\/(png|jpe?g|gif|webp|avif|svg\+xml)$/.test(type)) return null
  const bytes = await readLimited(res, IMAGE_LIMIT + 1)
  if (bytes.length > IMAGE_LIMIT) return null
  return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`
}

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handle(request) {
  const params = new URL(request.url).searchParams
  try {
    const page = params.get('url')
    if (page) {
      const url = publicUrl(page)
      if (!url) return json({ error: 'invalid url' }, 400)
      return json(await preview(url))
    }
    const img = params.get('image')
    if (img) {
      const url = publicUrl(img)
      if (!url) return json({ error: 'invalid url' }, 400)
      const data = await imageData(url)
      if (!data) return json({ error: 'not an image' }, 415)
      return new Response(data, { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=86400' } })
    }
    return json({ error: 'missing url' }, 400)
  } catch (err) {
    console.error(err)
    return json({ error: 'could not fetch' }, 502)
  }
}

export default { fetch: handle }
