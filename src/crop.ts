import { hashData, saveAsset } from './assets'
import { useStore } from './store'
import type { ImageEl } from './types'

/**
 * Cropping images. The original stays with the element (`src`), so a crop can
 * always be widened again; the cropped picture is saved as its own image, so
 * the board, exports and share links simply show it.
 */

export type Rect = [x: number, y: number, w: number, h: number]

export const FULL: Rect = [0, 0, 1, 1]

export function startCrop(id: string) {
  const s = useStore.getState()
  const el = s.doc.elements.find((e) => e.id === id)
  if (el?.type !== 'image' || !s.doc.key) return
  s.select([id])
  s.setCropId(id)
}

/** Where the whole original sits on the board, given the element's current crop. */
export function originalBox(el: ImageEl, nw: number, nh: number) {
  const c = el.crop ?? FULL
  const sx = el.w / (c[2] * nw)
  const sy = el.h / (c[3] * nh)
  const W = nw * sx
  const H = nh * sy
  return { x: el.x - c[0] * W, y: el.y - c[1] * H, w: W, h: H }
}

async function cropData(url: string, r: Rect) {
  const img = new Image()
  img.src = url
  await img.decode()
  const nw = img.naturalWidth
  const nh = img.naturalHeight
  const sx = Math.round(r[0] * nw)
  const sy = Math.round(r[1] * nh)
  const w = Math.max(1, Math.round(r[2] * nw))
  const h = Math.max(1, Math.round(r[3] * nh))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(img, sx, sy, w, h, 0, 0, w, h)
  // keep transparency for PNGs; photos stay JPEG
  return url.startsWith('data:image/png') ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9)
}

const same = (a: Rect, b: Rect) => a.every((v, i) => Math.abs(v - b[i]) < 0.0005)

/** Apply a crop (fractions of the original) to the image: one undo step. */
export async function applyCrop(id: string, r: Rect, originalUrl: string, nw: number, nh: number) {
  const s = useStore.getState()
  const el = s.doc.elements.find((e) => e.id === id)
  if (el?.type !== 'image') return
  const current = el.crop ?? FULL
  if (same(current, r)) return
  const box = originalBox(el, nw, nh)
  const base = el.src ?? el.asset
  const next: ImageEl = {
    ...el,
    x: box.x + r[0] * box.w,
    y: box.y + r[1] * box.h,
    w: r[2] * box.w,
    h: r[3] * box.h,
  }
  if (same(r, FULL)) {
    // back to the whole picture
    next.asset = base
    delete next.src
    delete next.crop
  } else {
    const url = await cropData(originalUrl, r)
    const hash = await hashData(url)
    await saveAsset(hash, url)
    next.asset = hash
    next.src = base
    next.crop = r
  }
  const now = useStore.getState()
  now.commit(now.doc.elements.map((e) => (e.id === id ? next : e)))
}
