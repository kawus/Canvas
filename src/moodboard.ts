import { hashData, loadAsset, saveAsset } from './assets'
import { boxIntersects, geometricBounds } from './geometry'
import { importImages, prepareImage } from './images'
import { hostOf, wrapText } from './layout'
import { freeSpot } from './placement'
import { newElementId } from './storage'
import { useStore } from './store'
import type { El, ImageEl, LinkEl, Point, SwatchEl } from './types'

/**
 * Moodboard pieces: link cards with previews, images straight from the web,
 * colour swatches and palettes pulled from photos.
 */

const S = () => useStore.getState()
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i

/** A single web address (what people paste or drop). */
export function isUrl(text: string) {
  const t = text.trim()
  return /^https?:\/\/\S+$/i.test(t) && !/\s/.test(t)
}

function place(els: El[]) {
  const s = S()
  s.setTool('select')
  s.commit([...s.doc.elements, ...els])
  s.select(els.map((e) => e.id))
}

/** Image bytes from another site, fetched through our server (browsers can't read them directly). */
async function fetchImage(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(`api/unfurl?image=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(12000) })
    const text = res.ok ? await res.text() : ''
    if (!text.startsWith('data:image/')) return null
    return await (await fetch(text)).blob()
  } catch {
    return null
  }
}

export async function importImageUrl(url: string, at?: Point) {
  S().showToast('Adding image…')
  const blob = await fetchImage(url)
  if (blob) await importImages([blob], at)
  else S().showToast('Couldn’t add that image')
}

interface Preview {
  url: string
  title: string
  description: string
  site: string
  image: string
  isImage?: boolean
}

const CARD_W = 280

/** Card height that fits its content (mirrors linkLayout). */
function cardHeight(title: string, description: string, hasImage: boolean) {
  const textW = CARD_W - 24
  const titleLines = Math.min(2, wrapText(title, 15, textW).length)
  const descLines = description ? Math.min(3, wrapText(description.replace(/\s+/g, ' '), 12.5, textW).length) : 0
  const header = hasImage ? 6 + (CARD_W - 12) * 0.56 + 10 : 12
  return Math.round(header + titleLines * 18.75 + 4 + (descLines ? descLines * 15.625 + 4 : 0) + 14.375 + 12 + 6)
}

/** Add a link as a preview card (title, description, site, image). */
export async function addLink(raw: string, at?: Point) {
  const url = raw.trim()
  if (IMAGE_EXT.test(url)) return importImageUrl(url, at)
  S().showToast('Adding link…')
  let p: Preview = { url, title: '', description: '', site: hostOf(url), image: '' }
  try {
    const res = await fetch(`api/unfurl?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000) })
    if (res.ok && (res.headers.get('content-type') || '').includes('json')) p = { ...p, ...((await res.json()) as Preview) }
  } catch {
    /* offline or no server: a plain card still works */
  }
  if (p.isImage && p.image) return importImageUrl(p.image, at)

  let image: string | undefined
  if (p.image) {
    const blob = await fetchImage(p.image)
    if (blob) {
      try {
        // cropped to the card's preview shape, so exports (which can't crop) look the same
        const { url: data } = await prepareImage(blob, { aspect: 1 / 0.56, maxSide: 900 })
        image = await hashData(data)
        await saveAsset(image, data)
      } catch {
        image = undefined
      }
    }
  }
  const title = p.title || hostOf(p.url)
  const h = cardHeight(title, p.description, !!image)
  const [cx, cy] = at ?? freeSpot(CARD_W, h)
  const el: LinkEl = {
    id: newElementId(),
    type: 'link',
    color: 'ink',
    x: cx - CARD_W / 2,
    y: cy - h / 2,
    w: CARD_W,
    h,
    url: p.url || url,
    title,
    ...(p.description ? { description: p.description } : {}),
    ...(p.site ? { site: p.site } : {}),
    ...(image ? { image } : {}),
  }
  place([el])
}

export const SWATCH_W = 104
export const SWATCH_H = 132

function swatch(hex: string, x: number, y: number): SwatchEl {
  return { id: newElementId(), type: 'swatch', color: 'ink', x, y, w: SWATCH_W, h: SWATCH_H, hex: hex.toLowerCase() }
}

export function addSwatch(hex: string, at?: Point) {
  const [cx, cy] = at ?? freeSpot(SWATCH_W, SWATCH_H)
  place([swatch(hex, cx - SWATCH_W / 2, cy - SWATCH_H / 2)])
}

/* ---------- Palette from an image ---------- */

const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
const dist2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

/** The image's main colours (k-means on a small copy of the image). */
async function dominantColors(dataUrl: string, k = 5): Promise<string[]> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  // no smoothing: blended edge pixels would show up as extra colours
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size).data
  const px: number[][] = []
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) px.push([data[i], data[i + 1], data[i + 2]])
  if (!px.length) return []

  // start from colours far apart from each other, then refine
  const centers: number[][] = [px[Math.floor(px.length / 2)]]
  while (centers.length < k) {
    let best = px[0]
    let bestD = -1
    for (const p of px) {
      const d = Math.min(...centers.map((c) => dist2(p, c)))
      if (d > bestD) {
        bestD = d
        best = p
      }
    }
    if (bestD <= 0) break
    centers.push(best)
  }
  let counts: number[] = []
  for (let iter = 0; iter < 12; iter++) {
    const sums = centers.map(() => [0, 0, 0])
    counts = centers.map(() => 0)
    for (const p of px) {
      let ci = 0
      let cd = Infinity
      centers.forEach((c, i) => {
        const d = dist2(p, c)
        if (d < cd) {
          cd = d
          ci = i
        }
      })
      sums[ci][0] += p[0]
      sums[ci][1] += p[1]
      sums[ci][2] += p[2]
      counts[ci]++
    }
    centers.forEach((c, i) => {
      if (counts[i]) for (let j = 0; j < 3; j++) c[j] = sums[i][j] / counts[i]
    })
  }
  const ranked = centers.map((c, i) => ({ c, n: counts[i] })).filter((x) => x.n > px.length * 0.03)
  ranked.sort((a, b) => b.n - a.n)
  // drop near-duplicates
  const out: number[][] = []
  for (const { c } of ranked) if (!out.some((o) => dist2(o, c) < 18 ** 2)) out.push(c)
  return out.map(toHex)
}

/** Put the image's palette as swatches in a row underneath it. */
export async function extractPalette(img: ImageEl) {
  const data = await loadAsset(img.asset)
  if (!data) {
    S().showToast('That image isn’t loaded yet')
    return
  }
  const colors = await dominantColors(data)
  if (!colors.length) return
  const b = geometricBounds([img])!
  const gap = 12
  const rowW = colors.length * SWATCH_W + (colors.length - 1) * gap
  // right under the image, unless something is already there
  let x = b.minX
  let y = b.maxY + 24
  const under = { minX: x, minY: y, maxX: x + rowW, maxY: y + SWATCH_H }
  if (S().doc.elements.some((e) => e.id !== img.id && boxIntersects(geometricBounds([e])!, under))) {
    const [cx, cy] = freeSpot(rowW, SWATCH_H)
    x = cx - rowW / 2
    y = cy - SWATCH_H / 2
  }
  place(colors.map((hex, i) => swatch(hex, x + i * (SWATCH_W + gap), y)))
}
