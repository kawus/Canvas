import { boxIntersects, geometricBounds } from './geometry'
import type { Box, El } from './types'

/**
 * Smart guides: while moving, resizing or drawing, edges and centres snap to
 * the edges and centres of nearby objects, and guide lines show the match.
 */

export interface Guide {
  /** 'x' = vertical line at x = at; 'y' = horizontal line at y = at */
  axis: 'x' | 'y'
  at: number
  from: number
  to: number
}

const xs = (b: Box) => [b.minX, (b.minX + b.maxX) / 2, b.maxX]
const ys = (b: Box) => [b.minY, (b.minY + b.maxY) / 2, b.maxY]

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

/** Guide lines for every target value that lines up exactly with the (snapped) box. */
export function guidesFor(box: Box, targets: Box[], axes: { x: number[]; y: number[] }): Guide[] {
  const byKey = new Map<string, Guide>()
  const add = (axis: 'x' | 'y', at: number, from: number, to: number) => {
    const key = `${axis}:${Math.round(at * 10)}`
    const g = byKey.get(key)
    if (g) {
      g.from = Math.min(g.from, from)
      g.to = Math.max(g.to, to)
    } else byKey.set(key, { axis, at, from, to })
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

/** Snap a whole box being moved: its edges and centre on both axes. */
export function snapMove(box: Box, targets: Box[], tol: number) {
  const dx = bestOffset(xs(box), targets, xs, tol) ?? 0
  const dy = bestOffset(ys(box), targets, ys, tol) ?? 0
  const moved = { minX: box.minX + dx, minY: box.minY + dy, maxX: box.maxX + dx, maxY: box.maxY + dy }
  return { dx, dy, guides: guidesFor(moved, targets, { x: xs(moved), y: ys(moved) }) }
}

/** Snap individual edges / points (resizing a side, dragging a corner while drawing). */
export function snapValues(x: number | null, y: number | null, targets: Box[], tol: number) {
  const dx = x === null ? 0 : (bestOffset([x], targets, xs, tol) ?? 0)
  const dy = y === null ? 0 : (bestOffset([y], targets, ys, tol) ?? 0)
  return { dx, dy }
}
