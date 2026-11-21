/**
 * Place cards: a pasted Google Maps or Apple Maps link becomes a card with a
 * calm map picture, a pin, the place's name and address. Tapping it opens the
 * link (directions in the maps app). The map is drawn once from OpenStreetMap
 * when the card is added and stored like a photo, so looking at a board never
 * contacts Google, Apple or OpenStreetMap.
 */

export interface Place {
  service: 'Google Maps' | 'Apple Maps'
  name?: string
  lat?: number
  lng?: number
}

const coord = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180
const clean = (s: string | null | undefined) => (s ?? '').replace(/\+/g, ' ').trim().slice(0, 200)

/** What a maps link points to (as much as the link itself says). */
export function parsePlace(raw: string): Place | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const q = u.searchParams

  // short links from the Share button: what they lead to is looked up when the card is added
  if (host === 'maps.app.goo.gl' || (host === 'goo.gl' && u.pathname.startsWith('/maps'))) return { service: 'Google Maps' }

  const google = (/^google\.[a-z.]{2,6}$/.test(host) && u.pathname.startsWith('/maps')) || /^maps\.google\.[a-z.]{2,6}$/.test(host)
  if (google) {
    const place: Place = { service: 'Google Maps' }
    const path = decodeURIComponent(u.pathname)
    const named = /\/maps\/(?:place|search)\/([^/@]+)/.exec(path)
    if (named) place.name = clean(named[1])
    // the exact spot (!3d…!4d…) beats the map's centre (@lat,lng)
    const exact = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(path + u.search)
    const centre = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(path)
    const m = exact ?? centre
    if (m && coord(+m[1], +m[2])) [place.lat, place.lng] = [+m[1], +m[2]]
    const query = q.get('q') ?? q.get('query') ?? q.get('daddr')
    if (query) {
      const ll = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(query)
      if (ll && coord(+ll[1], +ll[2])) [place.lat, place.lng] = [+ll[1], +ll[2]]
      else place.name ??= clean(query)
    }
    return place.name || place.lat !== undefined ? place : { service: 'Google Maps' }
  }

  if (host === 'maps.apple.com' || host === 'maps.apple') {
    const place: Place = { service: 'Apple Maps' }
    const name = q.get('name') ?? q.get('q') ?? q.get('daddr')
    const ll = (q.get('coordinate') ?? q.get('ll') ?? q.get('sll') ?? '').split(',').map(Number)
    if (ll.length === 2 && coord(ll[0], ll[1])) [place.lat, place.lng] = [ll[0], ll[1]]
    if (name && !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(name)) place.name = clean(name)
    else if (q.get('address')) place.name = clean(q.get('address'))
    return place
  }
  return null
}

/* ---------- the map picture ---------- */

const TILE = 256
const ZOOM = 16
export const MAP_W = 900
export const MAP_H = 504

/** Draw a calm map around a spot, with a pin, from OpenStreetMap tiles (fetched through Canvas's server, as "z/x/y"). */
export async function drawMap(lat: number, lng: number, fetchTiles: (tiles: string[]) => Promise<(string | null)[]>): Promise<string | null> {
  const n = 2 ** ZOOM
  const px = ((lng + 180) / 360) * n * TILE
  const rad = (lat * Math.PI) / 180
  const py = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n * TILE
  const left = px - MAP_W / 2
  const top = py - MAP_H / 2
  const canvas = document.createElement('canvas')
  canvas.width = MAP_W
  canvas.height = MAP_H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.fillStyle = '#efe9df'
  ctx.fillRect(0, 0, MAP_W, MAP_H)
  const spots: [number, number][] = []
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + MAP_W) / TILE); tx++) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + MAP_H) / TILE); ty++) if (ty >= 0 && ty < n) spots.push([tx, ty])
  }
  const data = await fetchTiles(spots.map(([tx, ty]) => `${ZOOM}/${((tx % n) + n) % n}/${ty}`))
  let drawn = 0
  await Promise.all(
    spots.map(async ([tx, ty], i) => {
      if (!data[i]) return
      const img = new Image()
      img.src = data[i]!
      await img.decode().catch(() => {})
      ctx.drawImage(img, Math.round(tx * TILE - left), Math.round(ty * TILE - top))
      drawn++
    }),
  )
  if (!drawn) return null
  // calmer colours: mostly desaturated, a little warm, so it sits with the board
  const pixels = ctx.getImageData(0, 0, MAP_W, MAP_H)
  const d = pixels.data
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11
    d[i] = Math.min(255, g * 0.62 + d[i] * 0.38 + 8)
    d[i + 1] = Math.min(255, g * 0.62 + d[i + 1] * 0.38 + 4)
    d[i + 2] = Math.min(255, g * 0.62 + d[i + 2] * 0.38 - 2)
  }
  ctx.putImageData(pixels, 0, 0)
  // the pin
  const cx = MAP_W / 2
  const cy = MAP_H / 2
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.28)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 3
  ctx.fillStyle = '#ff3b30'
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.bezierCurveTo(cx - 8, cy - 14, cx - 19, cy - 22, cx - 19, cy - 36)
  ctx.arc(cx, cy - 36, 19, Math.PI, 0)
  ctx.bezierCurveTo(cx + 19, cy - 22, cx + 8, cy - 14, cx, cy)
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(cx, cy - 36, 7, 0, Math.PI * 2)
  ctx.fill()
  // credit, as OpenStreetMap asks
  ctx.font = '500 15px system-ui, sans-serif'
  const credit = '© OpenStreetMap'
  const tw = ctx.measureText(credit).width
  ctx.fillStyle = 'rgba(255,255,255,0.82)'
  ctx.fillRect(MAP_W - tw - 16, MAP_H - 26, tw + 16, 26)
  ctx.fillStyle = '#555'
  ctx.fillText(credit, MAP_W - tw - 8, MAP_H - 8)
  return canvas.toDataURL('image/jpeg', 0.86)
}
