import type { BoxEl, FreedrawEl, LineEl, SizeKey, StrokePoint } from './types'

/**
 * Hold to straighten: draw a rough line, circle or rectangle, keep still for a
 * moment at the end, and it settles into a clean shape (like Apple's Notes).
 * Anything that doesn't clearly look like one of those stays as you drew it.
 */

export const STRAIGHTEN_MS = 520
/** moving less than this (screen px) still counts as holding still */
export const STILL_PX = 5

type Pt = [number, number]

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Distance from p to the line through a and b. */
function offLine(p: Pt, a: Pt, b: Pt) {
  const len = dist(a, b)
  if (len < 1e-6) return dist(p, a)
  return Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len
}

export type Shape =
  | { kind: 'line'; a: Pt; b: Pt }
  | { kind: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number }

/** What a stroke looks like, if it clearly looks like a line, an ellipse or a rectangle. `zoom` turns screen sizes into board sizes. */
export function recognize(points: StrokePoint[], zoom: number): Shape | null {
  const pts: Pt[] = points.map((p) => [p[0], p[1]])
  if (pts.length < 6) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let length = 0
  pts.forEach((p, i) => {
    minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1])
    if (i) length += dist(p, pts[i - 1])
  })
  const w = maxX - minX
  const h = maxY - minY
  const diag = Math.hypot(w, h)
  // too small to be meant as a shape
  if (diag * zoom < 28) return null
  const a = pts[0]
  const b = pts[pts.length - 1]
  const ends = dist(a, b)

  // a line: the stroke never strays far from the straight path between its ends
  if (ends > 0.8 * diag && length < 1.3 * ends) {
    const dev = Math.max(...pts.map((p) => offLine(p, a, b)))
    if (dev < Math.max(4 / zoom, 0.07 * ends)) {
      // nearly level or upright: make it exactly so
      const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
      const near = (t: number) => Math.abs(((angle - t + 540) % 360) - 180) > 180 - 5
      let end: Pt = b
      if (near(0) || near(180)) end = [b[0], a[1]]
      else if (near(90) || near(-90)) end = [a[0], b[1]]
      return { kind: 'line', a, b: end }
    }
    return null
  }

  // a closed shape: it comes back to where it started, and goes all the way round
  if (ends < 0.3 * diag && length > 2.2 * Math.max(w, h) && Math.min(w, h) > 0.12 * Math.max(w, h)) {
    // rectangles reach their corners; ellipses stay well away from them
    const corners: Pt[] = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]]
    const reached = corners.filter((c) => pts.some((p) => dist(p, c) < 0.1 * diag)).length
    const nearEdge = pts.filter((p) => Math.min(Math.abs(p[0] - minX), Math.abs(p[0] - maxX)) / w < 0.1 || Math.min(Math.abs(p[1] - minY), Math.abs(p[1] - maxY)) / h < 0.1).length / pts.length
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const roundness = pts.reduce((sum, p) => sum + Math.abs(Math.hypot((p[0] - cx) / (w / 2), (p[1] - cy) / (h / 2)) - 1), 0) / pts.length
    let kind: 'rect' | 'ellipse' | null = null
    if (reached >= 3 && nearEdge > 0.7) kind = 'rect'
    else if (roundness < 0.16 && reached <= 1) kind = 'ellipse'
    if (!kind) return null
    // nearly square or round: make it exactly so
    let box = { x: minX, y: minY, w, h }
    if (Math.abs(w - h) / Math.max(w, h) < 0.12) {
      const s = (w + h) / 2
      box = { x: cx - s / 2, y: cy - s / 2, w: s, h: s }
    }
    return { kind, ...box }
  }
  return null
}

/** The clean element for a recognised stroke, in the stroke's own colour and weight. */
export function straightened(stroke: FreedrawEl, shape: Shape): FreedrawEl | LineEl | BoxEl | null {
  if (stroke.highlight) {
    // the highlighter keeps its look: a straight stroke of ink, lines only
    if (shape.kind !== 'line') return null
    const steps = 24
    const pressure = 0.5
    const points: StrokePoint[] = Array.from({ length: steps + 1 }, (_, i) => [
      shape.a[0] + ((shape.b[0] - shape.a[0]) * i) / steps,
      shape.a[1] + ((shape.b[1] - shape.a[1]) * i) / steps,
      pressure,
    ])
    return { ...stroke, points, pressure: false }
  }
  // shape outlines are thinner than pen ink at the same setting: keep the weight that was drawn
  const size: SizeKey = ({ s: 'm', m: 'l', l: 'l' } as const)[stroke.size]
  if (shape.kind === 'line') {
    return { id: stroke.id, type: 'line', color: stroke.color, size, x1: shape.a[0], y1: shape.a[1], x2: shape.b[0], y2: shape.b[1] }
  }
  return { id: stroke.id, type: shape.kind, color: stroke.color, size, fill: 'none', x: shape.x, y: shape.y, w: shape.w, h: shape.h }
}
