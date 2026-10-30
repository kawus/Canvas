import { HIGHLIGHT_SCALE, PEN_SIZE, STROKE_WIDTH } from './constants'
import { measureText } from './textMetrics'
import type { Box, El, Point } from './types'

const boundsCache = new WeakMap<El, Box>()

export function getBounds(el: El): Box {
  const cached = boundsCache.get(el)
  if (cached) return cached
  let b: Box
  switch (el.type) {
    case 'freedraw': {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const [x, y] of el.points) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
      b = { minX, minY, maxX, maxY }
      break
    }
    case 'rect':
    case 'ellipse':
    case 'sticky':
    case 'image':
    case 'link':
    case 'swatch':
      b = { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.h }
      break
    case 'line':
    case 'arrow':
      b = {
        minX: Math.min(el.x1, el.x2),
        minY: Math.min(el.y1, el.y2),
        maxX: Math.max(el.x1, el.x2),
        maxY: Math.max(el.y1, el.y2),
      }
      break
    case 'text': {
      const m = measureText(el.text || ' ', el.fontSize)
      b = { minX: el.x, minY: el.y, maxX: el.x + Math.max(m.width, el.fontSize * 0.3), maxY: el.y + m.height }
      break
    }
  }
  boundsCache.set(el, b)
  return b
}

/** Half of the visual stroke thickness, used to pad bounds and hit areas. */
export function strokeHalf(el: El) {
  if (el.type === 'freedraw') return (PEN_SIZE[el.size] * (el.highlight ? HIGHLIGHT_SCALE : 1)) / 2
  if (el.type === 'text' || el.type === 'sticky' || el.type === 'image' || el.type === 'link' || el.type === 'swatch') return 0
  return STROKE_WIDTH[el.size] / 2
}

export function unionBounds(els: El[]): Box | null {
  if (!els.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const el of els) {
    const b = getBounds(el)
    const pad = strokeHalf(el)
    minX = Math.min(minX, b.minX - pad)
    minY = Math.min(minY, b.minY - pad)
    maxX = Math.max(maxX, b.maxX + pad)
    maxY = Math.max(maxY, b.maxY + pad)
  }
  return { minX, minY, maxX, maxY }
}

/** Geometric bounds (no stroke padding) used as the reference frame for resizing. */
export function geometricBounds(els: El[]): Box | null {
  if (!els.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const el of els) {
    const b = getBounds(el)
    minX = Math.min(minX, b.minX)
    minY = Math.min(minY, b.minY)
    maxX = Math.max(maxX, b.maxX)
    maxY = Math.max(maxY, b.maxY)
  }
  return { minX, minY, maxX, maxY }
}

export function boxContains(outer: Box, inner: Box) {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY
}

export function boxIntersects(a: Box, b: Box) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

export function pointInBox(p: Point, b: Box, pad = 0) {
  return p[0] >= b.minX - pad && p[0] <= b.maxX + pad && p[1] >= b.minY - pad && p[1] <= b.maxY + pad
}

export function normalizeBox(x1: number, y1: number, x2: number, y2: number): Box {
  return { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2) }
}

export function distToSegment(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const x = a[0] + t * dx
  const y = a[1] + t * dy
  return Math.hypot(p[0] - x, p[1] - y)
}

/** Whether a world point touches an element. `tol` is the hit slop in world units. */
export function hitTest(el: El, p: Point, tol: number): boolean {
  const b = getBounds(el)
  const pad = strokeHalf(el) + tol
  if (!pointInBox(p, b, pad)) return false
  switch (el.type) {
    case 'text':
    case 'sticky':
    case 'image':
    case 'link':
    case 'swatch':
      return true
    case 'rect': {
      if (el.fill !== 'none' || el.text) return true
      const inside = pointInBox(p, b, pad)
      const deep = pointInBox(p, { minX: b.minX + pad, minY: b.minY + pad, maxX: b.maxX - pad, maxY: b.maxY - pad })
      return inside && !deep
    }
    case 'ellipse': {
      const rx = (b.maxX - b.minX) / 2
      const ry = (b.maxY - b.minY) / 2
      const cx = b.minX + rx
      const cy = b.minY + ry
      if (rx < 1 || ry < 1) return true
      const nx = (p[0] - cx) / rx
      const ny = (p[1] - cy) / ry
      const r = Math.hypot(nx, ny)
      if ((el.fill !== 'none' || el.text) && r <= 1) return true
      return Math.abs(r - 1) * Math.min(rx, ry) <= pad
    }
    case 'line':
    case 'arrow':
      return distToSegment(p, [el.x1, el.y1], [el.x2, el.y2]) <= pad
    case 'freedraw': {
      const pts = el.points
      if (pts.length === 1) return Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) <= pad
      for (let i = 1; i < pts.length; i++) {
        if (distToSegment(p, [pts[i - 1][0], pts[i - 1][1]], [pts[i][0], pts[i][1]]) <= pad) return true
      }
      return false
    }
  }
}

/** Top-most element under the point. */
export function hitTopmost(elements: El[], p: Point, tol: number): El | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    if (hitTest(elements[i], p, tol)) return elements[i]
  }
  return null
}

export function translateEl<T extends El>(el: T, dx: number, dy: number): T {
  switch (el.type) {
    case 'freedraw':
      return { ...el, points: el.points.map(([x, y, pr]) => [x + dx, y + dy, pr]) }
    case 'line':
    case 'arrow':
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy }
    default:
      return { ...el, x: (el as { x: number }).x + dx, y: (el as { y: number }).y + dy }
  }
}

/** Map an element from one reference box to another (resize / flip). */
export function scaleEl<T extends El>(el: T, from: Box, to: Box, uniformText: boolean): T {
  const fw = from.maxX - from.minX
  const fh = from.maxY - from.minY
  const sx = fw === 0 ? 1 : (to.maxX - to.minX) / fw
  const sy = fh === 0 ? 1 : (to.maxY - to.minY) / fh
  const mx = (x: number) => to.minX + (x - from.minX) * sx
  const my = (y: number) => to.minY + (y - from.minY) * sy
  switch (el.type) {
    case 'freedraw':
      return { ...el, points: el.points.map(([x, y, pr]) => [mx(x), my(y), pr]) }
    case 'line':
    case 'arrow':
      return { ...el, x1: mx(el.x1), y1: my(el.y1), x2: mx(el.x2), y2: my(el.y2) }
    case 'rect':
    case 'ellipse':
    case 'sticky':
    case 'image':
    case 'link':
    case 'swatch': {
      const b = normalizeBox(mx(el.x), my(el.y), mx(el.x + el.w), my(el.y + el.h))
      return { ...el, x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY }
    }
    case 'text': {
      const s = uniformText ? Math.abs(sy) : Math.min(Math.abs(sx), Math.abs(sy))
      const fontSize = Math.max(4, el.fontSize * s)
      const b = getBounds(el)
      const nx = Math.min(mx(b.minX), mx(b.maxX))
      const ny = Math.min(my(b.minY), my(b.maxY))
      return { ...el, x: nx, y: ny, fontSize }
    }
  }
}

export function center(b: Box): Point {
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]
}
