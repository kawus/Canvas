import { boxIntersects, geometricBounds } from './geometry'
import { toWorld } from './handles'
import { useStore } from './store'
import type { Box, El, Point } from './types'

/**
 * Where to put something new (pasted, inserted or picked) so it doesn't land
 * on top of what's already there: the free spot nearest the middle of the screen.
 * `taken` are extra boxes to avoid (items being added in the same go).
 */
export function freeSpot(w: number, h: number, taken: Box[] = []): Point {
  const s = useStore.getState()
  const [cx, cy] = toWorld(s.viewport, window.innerWidth / 2, window.innerHeight / 2)
  const pad = 16
  const boxes = [...s.doc.elements.map((e) => geometricBounds([e])!), ...taken]
  const fits = (x: number, y: number) => {
    const b = { minX: x - w / 2 - pad, minY: y - h / 2 - pad, maxX: x + w / 2 + pad, maxY: y + h / 2 + pad }
    return !boxes.some((o) => boxIntersects(o, b))
  }
  if (fits(cx, cy)) return [cx, cy]
  const step = 40 / Math.max(s.viewport.zoom, 0.25)
  const offsets: [number, number][] = []
  for (let i = -20; i <= 20; i++) for (let j = -20; j <= 20; j++) offsets.push([i * step, j * step])
  offsets.sort((a, b) => Math.hypot(a[0], a[1] * 1.4) - Math.hypot(b[0], b[1] * 1.4))
  for (const [dx, dy] of offsets) if (fits(cx + dx, cy + dy)) return [cx + dx, cy + dy]
  return [cx, cy]
}

export const boxAt = ([x, y]: Point, w: number, h: number): Box => ({
  minX: x - w / 2,
  minY: y - h / 2,
  maxX: x + w / 2,
  maxY: y + h / 2,
})

/**
 * The part of the screen that's clear of Canvas's own buttons (the top bars, the
 * toolbar), in board coordinates. On a phone the undo row sits under the top bar.
 */
export function clearArea(): Box {
  const s = useStore.getState()
  const phone = window.innerWidth <= 760
  const [minX, minY] = toWorld(s.viewport, 12, phone ? 116 : 68)
  const [maxX, maxY] = toWorld(s.viewport, window.innerWidth - 12, window.innerHeight - 104)
  return { minX, minY, maxX, maxY }
}

const GAP = 24
const width = (b: Box) => b.maxX - b.minX
const height = (b: Box) => b.maxY - b.minY
const moved = (b: Box, x: number, y: number): Box => ({ minX: x, minY: y, maxX: x + width(b), maxY: y + height(b) })

/**
 * Where a new note (or a copy) should go so it doesn't cover anything: where it
 * was meant to go if that's free, otherwise the nearest spot beside what's in the
 * way, lined up with it (to its right, below, left or above), and inside the clear
 * part of the screen when it was placed there. `ignore` are ids that don't count;
 * `extra` are boxes that do (a copied selection as a whole).
 */
export function settleBox(want: Box, opts: { ignore?: Set<string>; extra?: Box[]; onScreen?: boolean } = {}): Box {
  // on screen if there's room there; otherwise the nearest free spot anywhere (the view moves to it)
  const spot = findSpot(want, opts) ?? (opts.onScreen ? findSpot(want, { ...opts, onScreen: false }) : null)
  if (!spot) return want
  if (opts.onScreen) showBox(spot)
  return spot
}

/** Move the view just enough that a box is in the clear part of the screen. */
export function showBox(b: Box) {
  const s = useStore.getState()
  const a = clearArea()
  const dx = b.minX < a.minX ? b.minX - a.minX : b.maxX > a.maxX ? Math.min(b.maxX - a.maxX, b.minX - a.minX) : 0
  const dy = b.minY < a.minY ? b.minY - a.minY : b.maxY > a.maxY ? Math.min(b.maxY - a.maxY, b.minY - a.minY) : 0
  if (dx || dy) s.setViewport({ ...s.viewport, x: s.viewport.x - dx * s.viewport.zoom, y: s.viewport.y - dy * s.viewport.zoom })
}

function findSpot(want: Box, opts: { ignore?: Set<string>; extra?: Box[]; onScreen?: boolean }): Box | null {
  const s = useStore.getState()
  const area = clearArea()
  // notes and copies may sit over arrows, lines and slide frames; not over other things
  const solid = (e: El) => e.type !== 'arrow' && e.type !== 'line' && e.type !== 'slide' && !opts.ignore?.has(e.id)
  const boxes = [...s.doc.elements.filter(solid).map((e) => geometricBounds([e])!), ...(opts.extra ?? [])]
  const fitsArea = width(want) <= width(area) && height(want) <= height(area)
  const inArea = (b: Box) => !opts.onScreen || !fitsArea || (b.minX >= area.minX && b.minY >= area.minY && b.maxX <= area.maxX && b.maxY <= area.maxY)
  const hit = (b: Box) => boxes.find((o) => boxIntersects(o, b))

  // first, keep it clear of the buttons (a note tapped near the top of a phone)
  let start = want
  if (opts.onScreen && fitsArea) {
    const x = Math.min(Math.max(want.minX, area.minX), area.maxX - width(want))
    const y = Math.min(Math.max(want.minY, area.minY), area.maxY - height(want))
    start = moved(want, x, y)
  }
  if (!hit(start) && inArea(start)) return start

  // then the nearest neat spot beside whatever is in the way
  const cx = (start.minX + start.maxX) / 2
  const cy = (start.minY + start.maxY) / 2
  const dist = (b: Box) => Math.hypot((b.minX + b.maxX) / 2 - cx, ((b.minY + b.maxY) / 2 - cy) * 1.2)
  const queue: Box[] = []
  const seen = new Set<string>()
  const around = (o: Box) => {
    for (const b of [
      moved(start, o.maxX + GAP, o.minY), // right, tops lined up
      moved(start, o.minX, o.maxY + GAP), // below, left edges lined up
      moved(start, o.minX - GAP - width(start), o.minY), // left
      moved(start, o.minX, o.minY - GAP - height(start)), // above
    ]) {
      const k = `${Math.round(b.minX)},${Math.round(b.minY)}`
      if (!seen.has(k)) {
        seen.add(k)
        queue.push(b)
      }
    }
  }
  const first = hit(start)
  if (first) around(first)
  for (let i = 0; i < 80 && queue.length; i++) {
    queue.sort((a, b) => dist(a) - dist(b))
    const b = queue.shift()!
    const o = hit(b)
    if (!o && inArea(b)) return b
    if (o) around(o)
  }
  return null
}
