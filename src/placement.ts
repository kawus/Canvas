import { boxIntersects, geometricBounds } from './geometry'
import { toWorld } from './handles'
import { useStore } from './store'
import type { Box, Point } from './types'

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
