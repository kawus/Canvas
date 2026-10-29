import { boxIntersects, geometricBounds } from './geometry'
import type { Box, El } from './types'

/**
 * Auto alignment while moving, resizing or drawing:
 * - smart guides: edges and centres snap to nearby objects (pink lines)
 * - equal spacing: snap so gaps match the neighbours' gaps (pink gap markers)
 * - optional grid: positions and sizes snap to the background dot grid
 */

export const GRID = 24

export type Guide =
  /** alignment line: axis 'x' = vertical line at x = at, 'y' = horizontal line at y = at */
  | { type: 'line'; axis: 'x' | 'y'; at: number; from: number; to: number }
  /** equal-spacing marker: a gap measured along `axis`, drawn across at `at` */
  | { type: 'gap'; axis: 'x' | 'y'; at: number; from: number; to: number }

export interface SnapOptions {
  objects: boolean
  grid: number | null
}

const xs = (b: Box) => [b.minX, (b.minX + b.maxX) / 2, b.maxX]
const ys = (b: Box) => [b.minY, (b.minY + b.maxY) / 2, b.maxY]

/** Accessors for one axis ("along") and the other ("across"). */
interface Axis {
  lo: (b: Box) => number
  hi: (b: Box) => number
  alo: (b: Box) => number
  ahi: (b: Box) => number
}
const AX: Axis = { lo: (b) => b.minX, hi: (b) => b.maxX, alo: (b) => b.minY, ahi: (b) => b.maxY }
const AY: Axis = { lo: (b) => b.minY, hi: (b) => b.maxY, alo: (b) => b.minX, ahi: (b) => b.maxX }

const gridOffset = (v: number, size: number) => Math.round(v / size) * size - v

/** Boxes of objects worth snapping to: everything on screen that isn't being moved. */
export function snapTargets(elements: El[], exclude: Set<string>, view: Box): Box[] {
  const pad = Math.max(view.maxX - view.minX, view.maxY - view.minY) * 0.25
  const area = { minX: view.minX - pad, minY: view.minY - pad, maxX: view.maxX + pad, maxY: view.maxY + pad }
  const out: Box[] = []
  for (const el of elements) {
    if (exclude.has(el.id)) continue
    // connectors follow shapes; snapping to them would only add noise
    if ((el.type === 'arrow' || el.type === 'line') && (el.start || el.end)) continue
    const b = geometricBounds([el])!
    if (boxIntersects(b, area)) out.push(b)
    if (out.length > 400) break
  }
  return out
}

/** Smallest offset that brings one of `values` onto one of the target values, within `tol`. */
function bestOffset(values: number[], targets: Box[], pick: (b: Box) => number[], tol: number) {
  let best: number | null = null
  for (const t of targets) {
    for (const tv of pick(t)) {
      for (const v of values) {
        const d = tv - v
        if (Math.abs(d) <= tol && (best === null || Math.abs(d) < Math.abs(best))) best = d
      }
    }
  }
  return best
}

/** Objects sharing a row (for x) or column (for y) with the box. */
function lineUp(box: Box, targets: Box[], A: Axis) {
  return targets.filter((t) => Math.min(A.ahi(t), A.ahi(box)) - Math.max(A.alo(t), A.alo(box)) > 0)
}

/** Offset that makes the box's gap to a neighbour equal an existing gap, or centres it between two. */
function spacingOffset(box: Box, targets: Box[], tol: number, A: Axis): number | null {
  const row = lineUp(box, targets, A)
  if (!row.length) return null
  const size = A.hi(box) - A.lo(box)
  let left: Box | null = null
  let right: Box | null = null
  for (const t of row) {
    if (A.hi(t) <= A.lo(box) + tol && (!left || A.hi(t) > A.hi(left))) left = t
    if (A.lo(t) >= A.hi(box) - tol && (!right || A.lo(t) < A.lo(right))) right = t
  }
  if (!left && !right) return null
  const candidates: number[] = []
  if (left && right && A.lo(right) - A.hi(left) > size) candidates.push((A.hi(left) + A.lo(right) - size) / 2)
  const sorted = [...row].sort((a, b) => A.lo(a) - A.lo(b))
  for (let i = 0; i + 1 < sorted.length; i++) {
    const g = A.lo(sorted[i + 1]) - A.hi(sorted[i])
    if (g <= 0) continue
    if (left) candidates.push(A.hi(left) + g)
    if (right) candidates.push(A.lo(right) - g - size)
  }
  let best: number | null = null
  for (const c of candidates) {
    const d = c - A.lo(box)
    if (Math.abs(d) <= tol && (best === null || Math.abs(d) < Math.abs(best))) best = d
  }
  return best
}

/** Markers for every gap in the box's row/column that equals one of the box's own gaps. */
function gapMarks(box: Box, targets: Box[], A: Axis, axis: 'x' | 'y'): Guide[] {
  const row = [...lineUp(box, targets, A), box].sort((a, b) => A.lo(a) - A.lo(b))
  const pairs: { a: Box; b: Box; g: number }[] = []
  for (let i = 0; i + 1 < row.length; i++) {
    const g = A.lo(row[i + 1]) - A.hi(row[i])
    if (g > 0.5) pairs.push({ a: row[i], b: row[i + 1], g })
  }
  const own = pairs.filter((p) => p.a === box || p.b === box).map((p) => p.g)
  const equal = pairs.filter((p) => own.some((g) => Math.abs(g - p.g) < 0.5))
  if (equal.length < 2) return []
  return equal.map((p) => ({
    type: 'gap',
    axis,
    from: A.hi(p.a),
    to: A.lo(p.b),
    at: (Math.max(A.alo(p.a), A.alo(p.b)) + Math.min(A.ahi(p.a), A.ahi(p.b))) / 2,
  }))
}

/** Alignment lines for every target value that lines up exactly with the (snapped) box. */
export function guidesFor(box: Box, targets: Box[], axes: { x: number[]; y: number[] }): Guide[] {
  const byKey = new Map<string, Guide>()
  const add = (axis: 'x' | 'y', at: number, from: number, to: number) => {
    const key = `${axis}:${Math.round(at * 10)}`
    const g = byKey.get(key)
    if (g) {
      g.from = Math.min(g.from, from)
      g.to = Math.max(g.to, to)
    } else byKey.set(key, { type: 'line', axis, at, from, to })
  }
  for (const t of targets) {
    for (const tv of xs(t)) {
      if (axes.x.some((v) => Math.abs(v - tv) < 0.01)) add('x', tv, Math.min(box.minY, t.minY), Math.max(box.maxY, t.maxY))
    }
    for (const tv of ys(t)) {
      if (axes.y.some((v) => Math.abs(v - tv) < 0.01)) add('y', tv, Math.min(box.minX, t.minX), Math.max(box.maxX, t.maxX))
    }
  }
  return [...byKey.values()]
}

const closest = (...ds: (number | null)[]) =>
  ds.reduce<number | null>((best, d) => (d !== null && (best === null || Math.abs(d) < Math.abs(best)) ? d : best), null)

/** Snap a whole box being moved: edges, centre and equal spacing on both axes, else the grid. */
export function snapMove(box: Box, targets: Box[], tol: number, opts: SnapOptions) {
  let dx: number | null = null
  let dy: number | null = null
  if (opts.objects) {
    dx = closest(bestOffset(xs(box), targets, xs, tol), spacingOffset(box, targets, tol, AX))
    dy = closest(bestOffset(ys(box), targets, ys, tol), spacingOffset(box, targets, tol, AY))
  }
  if (opts.grid) {
    dx ??= gridOffset(box.minX, opts.grid)
    dy ??= gridOffset(box.minY, opts.grid)
  }
  const ox = dx ?? 0
  const oy = dy ?? 0
  const moved = { minX: box.minX + ox, minY: box.minY + oy, maxX: box.maxX + ox, maxY: box.maxY + oy }
  const guides = opts.objects
    ? [
        ...guidesFor(moved, targets, { x: xs(moved), y: ys(moved) }),
        ...gapMarks(moved, targets, AX, 'x'),
        ...gapMarks(moved, targets, AY, 'y'),
      ]
    : []
  return { dx: ox, dy: oy, guides }
}

/** Snap individual edges / points (resizing a side, dragging a corner while drawing). */
export function snapValues(x: number | null, y: number | null, targets: Box[], tol: number, opts: SnapOptions) {
  const one = (v: number | null, pick: (b: Box) => number[]) => {
    if (v === null) return 0
    const d = opts.objects ? bestOffset([v], targets, pick, tol) : null
    return d ?? (opts.grid ? gridOffset(v, opts.grid) : 0)
  }
  return { dx: one(x, xs), dy: one(y, ys) }
}
