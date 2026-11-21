/**
 * Link previews and web images for moodboards.
 *
 *   GET /api/unfurl?url=<page>     → { url, title, description, site, image }   (Open Graph tags)
 *   GET /api/unfurl?image=<image>  → data URL of the image (text)
 *   GET /api/unfurl?place=1&lat=…&lng=…&q=…  → { lat, lng, name, address }   (OpenStreetMap's Nominatim)
 *   GET /api/unfurl?tiles=16/1/2,16/1/3…  → { tiles: [data URL | null] }  (OpenStreetMap map tiles, at most 16)
 *
 * Browsers can't read other sites directly, so the app asks this function.
 * Only public http(s) addresses are fetched, with a size and time limit.
 */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { allowPreview, tooMuch } from './_limits.js'
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

/**
 * Video and music services block server visits but offer oEmbed for previews
 * (title, who made it, a picture). Apple Music and Apple Podcasts don't; their
 * pages have the usual tags instead.
 * @param {URL} url
 */
async function oembed(url) {
  const host = url.hostname.replace(/^(www|m)\./, '')
  const q = encodeURIComponent(url.href)
  /** @type {[string, string] | null} */
  let found = null
  if (host === 'music.youtube.com') {
    // YouTube Music songs are YouTube videos
    const v = url.searchParams.get('v')
    if (v) found = [`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${v}`)}`, 'YouTube Music']
  } else if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) found = [`https://www.youtube.com/oembed?format=json&url=${q}`, 'YouTube']
  else if (/(^|\.)vimeo\.com$/.test(host)) found = [`https://vimeo.com/api/oembed.json?url=${q}`, 'Vimeo']
  else if (host === 'loom.com') found = [`https://www.loom.com/v1/oembed?url=${q}`, 'Loom']
  else if (host === 'open.spotify.com') found = [`https://open.spotify.com/oembed?url=${q}`, 'Spotify']
  else if (host === 'soundcloud.com') found = [`https://soundcloud.com/oembed?format=json&url=${q}`, 'SoundCloud']
  else if (host === 'tiktok.com') found = [`https://www.tiktok.com/oembed?url=${q}`, 'TikTok']
  else if (host === 'mixcloud.com') found = [`https://www.mixcloud.com/oembed/?format=json&url=${q}`, 'Mixcloud']
  else if (host === 'deezer.com') return deezer(url)
  else if (host === 'music.apple.com' || host === 'podcasts.apple.com') return apple(url, host === 'music.apple.com' ? 'Apple Music' : 'Apple Podcasts')
  if (!found) return null
  const [api, site] = found
  const res = await fetch(api, { signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) return null
  const d = /** @type {{ title?: string, author_name?: string, thumbnail_url?: string, image?: string, html?: string }} */ (await res.json())
  // SoundCloud's title reads "Track by Artist"; keep just the track
  let title = d.title || ''
  if (site === 'SoundCloud' && d.author_name && title.endsWith(` by ${d.author_name}`)) title = title.slice(0, -` by ${d.author_name}`.length)
  const href = url.href
  // TikTok's oEmbed often has no title or picture: say what it is and whose it is
  if (site === 'TikTok' && !title) {
    title = 'TikTok video'
    if (!d.author_name) d.author_name = /\/(@[\w.]{1,40})\//.exec(url.pathname)?.[1] ?? ''
  }
  return { url: href, title: title.slice(0, 300), description: (d.author_name || '').slice(0, 200), site, image: d.thumbnail_url || d.image || '' }
}

/**
 * Apple Music and Apple Podcasts: Apple's public lookup gives the title, who
 * made it and the cover (the last number in the link, or ?i= for a song).
 * @param {URL} url @param {string} site
 */
async function apple(url, site) {
  const nums = url.pathname.match(/\d{5,}/g)
  const id = url.searchParams.get('i') || (nums ? nums[nums.length - 1] : '')
  if (!/^\d{5,15}$/.test(id)) return null
  const res = await fetch(`https://itunes.apple.com/lookup?id=${id}`, { signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) return null
  const d = /** @type {{ results?: { trackName?: string, collectionName?: string, artistName?: string, artworkUrl100?: string, artworkUrl600?: string }[] }} */ (await res.json())
  const r = d.results?.[0]
  if (!r) return null
  const image = (r.artworkUrl600 || r.artworkUrl100 || '').replace(/\/\d+x\d+(bb)?\.(jpg|png)$/, '/600x600bb.$2')
  return { url: url.href, title: (r.trackName || r.collectionName || '').slice(0, 300), description: (r.artistName || '').slice(0, 200), site, image }
}

/**
 * Deezer: its public API gives the title, who made it and the cover.
 * @param {URL} url
 */
async function deezer(url) {
  const parts = url.pathname.split('/').filter(Boolean)
  const p = /^[a-z]{2}$/.test(parts[0] ?? '') ? parts.slice(1) : parts
  const type = { track: 'track', album: 'album', playlist: 'playlist', episode: 'episode', show: 'podcast', artist: 'artist' }[p[0] ?? '']
  if (!type || !/^\d{1,15}$/.test(p[1] ?? '')) return null
  const res = await fetch(`https://api.deezer.com/${type}/${p[1]}`, { signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) return null
  /** @type {any} */
  const d = await res.json()
  if (!d || d.error) return null
  const title = d.title || d.name || ''
  const by = d.artist?.name || d.creator?.name || d.podcast?.title || ''
  const image = d.cover_xl || d.album?.cover_xl || d.picture_xl || d.podcast?.picture_xl || ''
  return { url: url.href, title: String(title).slice(0, 300), description: String(by).slice(0, 200), site: 'Deezer', image }
}

/**
 * Share buttons often give short links (on.soundcloud.com, spotify.link):
 * follow them to the real address so the card can play.
 * @param {URL} url
 */
async function expand(url) {
  const short = { 'on.soundcloud.com': 'soundcloud.com', 'spotify.link': 'open.spotify.com', 'vm.tiktok.com': 'tiktok.com', 'vt.tiktok.com': 'tiktok.com', 'link.deezer.com': 'deezer.com', 'maps.app.goo.gl': 'google.com' }
  const host = url.hostname.replace(/^www\./, '')
  const want = /** @type {Record<string, string>} */ (short)[host] ?? (host === 'tiktok.com' && url.pathname.startsWith('/t/') ? 'tiktok.com' : '')
  if (!want) return url
  try {
    const { res, url: landed } = await publicFetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT) })
    void res
    // (maps links keep their query: it holds the place)
    if (landed.hostname.replace(/^(www|m)\./, '') !== want) return url
    return want === 'google.com' ? landed : new URL(landed.origin + landed.pathname)
  } catch {
    return url
  }
}

/** Google Maps or Apple Maps: the place is in the link itself (their pages aren't fetched). @param {URL} url */
function mapsLink(url) {
  const host = url.hostname.replace(/^www\./, '')
  if ((/^google\.[a-z.]{2,6}$/.test(host) && url.pathname.startsWith('/maps')) || /^maps\.google\.[a-z.]{2,6}$/.test(host)) return 'Google Maps'
  if (host === 'maps.apple.com' || host === 'maps.apple') return 'Apple Maps'
  return ''
}

const NOMINATIM = 'https://nominatim.openstreetmap.org'

/** "12 Bankside, London": the useful part of an OpenStreetMap address. @param {any} a */
function shortAddress(a) {
  if (!a) return ''
  const street = [a.house_number, a.road || a.pedestrian || a.square].filter(Boolean).join(' ')
  const town = a.city || a.town || a.village || a.suburb || a.municipality || a.county || ''
  return [street, town, street || town ? '' : a.country].filter(Boolean).join(', ')
}

/**
 * Where a place is and what it's called: from its coordinates (reverse) or its name (search).
 * @param {URLSearchParams} params
 */
async function place(params) {
  const lat = Number(params.get('lat'))
  const lng = Number(params.get('lng'))
  const q = (params.get('q') || '').slice(0, 200)
  const has = params.get('lat') !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180
  if (!has && !q) return null
  const api = has
    ? `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`
    : `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`
  const res = await fetch(api, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) return has ? { lat, lng, name: q, address: '' } : null
  /** @type {any} */
  let d = await res.json()
  if (Array.isArray(d)) d = d[0]
  if (!d || d.error) return has ? { lat, lng, name: q, address: '' } : null
  return {
    lat: has ? lat : Number(d.lat),
    lng: has ? lng : Number(d.lon),
    name: (q || d.name || '').slice(0, 200),
    address: shortAddress(d.address).slice(0, 200),
  }
}

/** OpenStreetMap map tiles, for a place card's map picture. @param {string} list */
async function tiles(list) {
  const wanted = list.split(',').slice(0, 16)
  return Promise.all(
    wanted.map(async (t) => {
      const m = /^(\d{1,2})\/(\d{1,7})\/(\d{1,7})$/.exec(t)
      if (!m || Number(m[1]) > 19) return null
      try {
        const res = await fetch(`https://tile.openstreetmap.org/${m[1]}/${m[2]}/${m[3]}.png`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT) })
        if (!res.ok) return null
        const bytes = await readLimited(res, 400_000)
        return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`
      } catch {
        return null
      }
    }),
  )
}

/** @param {URL} start */
async function preview(start) {
  const url = await expand(start)
  const maps = mapsLink(url)
  if (maps) return { url: url.href, title: '', description: '', site: maps, image: '' }
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
  // Bandcamp: the number its player needs (album=… or track=…)
  let player = ''
  if (finalUrl.hostname.endsWith('.bandcamp.com')) {
    const m = /bandcamp\.com\/EmbeddedPlayer\/(?:v=2\/)?(album|track)=(\d{1,15})/.exec(meta(html, ['og:video', 'og:video:secure_url', 'twitter:player']) || html)
    if (m) player = `${m[1]}=${m[2]}`
  }
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
    ...(player ? { player } : {}),
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
    if (!(await allowPreview(request))) return tooMuch()
    if (params.get('place')) return json((await place(params)) ?? { error: 'not found' }, 200)
    const list = params.get('tiles')
    if (list) return json({ tiles: await tiles(list) })
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
