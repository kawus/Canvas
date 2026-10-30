import { getBounds, pointInBox } from './geometry'
import type { El, FrameEl, LineEl, Point } from './types'

/**
 * Arrows and lines can attach their ends to shapes, stickies, images and text.
 * An attached end always points at the shape's centre and stops just outside
 * its outline, so connections follow when things are moved or resized.
 */

const GAP = 6

export function isFrame(el: El | undefined): el is FrameEl {
  return (
    !!el &&
    (el.type === 'rect' ||
      el.type === 'ellipse' ||
      el.type === 'sticky' ||
      el.type === 'image' ||
      el.type === 'text' ||
      el.type === 'link' ||
      el.type === 'swatch')
  )
}

function centerOf(el: FrameEl): Point {
  const b = getBounds(el)
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]
}

/** Point on the element's outline in the direction of `toward`, pushed out by a small gap. */
function edgePoint(el: FrameEl, toward: Point): Point {
  const b = getBounds(el)
  const [cx, cy] = centerOf(el)
  let dx = toward[0] - cx
  let dy = toward[1] - cy
  const len = Math.hypot(dx, dy)
  if (len < 0.001) return [cx, cy]
  dx /= len
  dy /= len
  const rx = Math.max((b.maxX - b.minX) / 2, 0.5)
  const ry = Math.max((b.maxY - b.minY) / 2, 0.5)
  let t: number
  if (el.type === 'ellipse') t = 1 / Math.hypot(dx / rx, dy / ry)
  else t = Math.min(dx === 0 ? Infinity : rx / Math.abs(dx), dy === 0 ? Infinity : ry / Math.abs(dy))
  return [cx + dx * (t + GAP), cy + dy * (t + GAP)]
}

function resolveLine(el: LineEl, byId: Map<string, El>): LineEl {
  const s = el.start ? byId.get(el.start) : undefined
  const e = el.end ? byId.get(el.end) : undefined
  const sValid = isFrame(s) && s.id !== el.id
  const eValid = isFrame(e) && e.id !== el.id
  let next: LineEl = el
  if ((el.start && !sValid) || (el.end && !eValid)) {
    // the attached element was deleted: keep the arrow where it is
    next = { ...el }
    if (!sValid) delete next.start
    if (!eValid) delete next.end
  }
  if (!sValid && !eValid) return next
  const a: Point = sValid ? centerOf(s) : [el.x1, el.y1]
  const b: Point = eValid ? centerOf(e) : [el.x2, el.y2]
  const [x1, y1] = sValid ? edgePoint(s, b) : a
  const [x2, y2] = eValid ? edgePoint(e, a) : b
  const same = (u: number, v: number) => Math.abs(u - v) < 0.01
  if (same(x1, el.x1) && same(y1, el.y1) && same(x2, el.x2) && same(y2, el.y2)) return next
  return { ...next, x1, y1, x2, y2 }
}

/** Recompute attached arrow ends. Returns the same array when nothing changed. */
export function resolveBindings(elements: El[]): El[] {
  let hasBound = false
  for (const el of elements) {
    if ((el.type === 'arrow' || el.type === 'line') && (el.start || el.end)) {
      hasBound = true
      break
    }
  }
  if (!hasBound) return elements
  const byId = new Map(elements.map((e) => [e.id, e]))
  let changed = false
  const out = elements.map((el) => {
    if ((el.type !== 'arrow' && el.type !== 'line') || (!el.start && !el.end)) return el
    const r = resolveLine(el, byId)
    if (r !== el) {
      changed = true
      byId.set(r.id, r)
    }
    return r
  })
  return changed ? out : elements
}

export function resolveDraftLine(el: LineEl, elements: El[]): LineEl {
  if (!el.start && !el.end) return el
  return resolveLine(el, new Map(elements.map((e) => [e.id, e])))
}

/** Top-most element an arrow end at `p` should attach to. */
export function bindTarget(elements: El[], p: Point, tol: number, exclude?: string): FrameEl | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]
    if (!isFrame(el) || el.id === exclude) continue
    if (pointInBox(p, getBounds(el), tol)) return el
  }
  return null
}
