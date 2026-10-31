import { getBounds, scaleEl, translateEl } from './geometry'
import { useStore } from './store'
import type { Box, El, Point } from './types'

/**
 * Tidy up: arrange a pile of things into a neat masonry layout (moodboards).
 * Images share one column width and keep their shape; everything else keeps
 * its size, and small items (like swatches) sit side by side. Reading order
 * (top to bottom, left to right) is kept. Lines and arrows don't take part;
 * attached arrows follow their shapes.
 */

const GAP = 24
const snap8 = (v: number) => Math.round(v / 8) * 8

export function tidyable(els: El[]) {
  return els.filter((e) => e.type !== 'line' && e.type !== 'arrow')
}

interface Item {
  el: El
  box: Box
  w: number
  h: number
  scalable: boolean
}

interface Placed {
  item: Item
  x: number
  y: number
  w: number
  h: number
}

const median = (vs: number[]) => {
  const s = [...vs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** Top to bottom in rows, left to right within a row. */
function readingOrder(items: Item[]) {
  const rowTol = median(items.map((i) => i.h)) / 2
  const byTop = [...items].sort((a, b) => a.box.minY - b.box.minY)
  const rows: Item[][] = []
  for (const it of byTop) {
    const row = rows[rows.length - 1]
    if (row && it.box.minY - row[0].box.minY < rowTol) row.push(it)
    else rows.push([it])
  }
  return rows.flatMap((r) => r.sort((a, b) => a.box.minX - b.box.minX))
}

function masonry(items: Item[], cols: number, colW: number) {
  const heights = new Array<number>(cols).fill(0)
  // a row of small items still filling up, per column
  const rows: ({ used: number; y: number; h: number } | null)[] = new Array(cols).fill(null)
  const placed: Placed[] = []
  for (const item of items) {
    const w = item.scalable ? colW : item.w
    const h = item.scalable ? (item.h * colW) / item.w : item.h
    const small = !item.scalable && w <= (colW - GAP) / 2
    // join a row of small things that still has room
    const open = small ? rows.findIndex((r) => r && r.used + GAP + w <= colW) : -1
    if (open >= 0) {
      const r = rows[open]!
      placed.push({ item, x: open * (colW + GAP) + r.used + GAP, y: r.y, w, h })
      r.used += GAP + w
      if (h > r.h) {
        heights[open] += h - r.h
        r.h = h
      }
      continue
    }
    const c = heights.indexOf(Math.min(...heights))
    const y = heights[c] ? heights[c] + GAP : 0
    placed.push({ item, x: c * (colW + GAP), y, w, h })
    heights[c] = y + h
    rows[c] = small ? { used: w, y, h } : null
  }
  const usedCols = Math.min(cols, items.length)
  return { placed, width: usedCols * colW + (usedCols - 1) * GAP, height: Math.max(...heights) }
}

/** The arranged elements, laid out from (0, 0), and the size of the block. `keepOrder` for things just added. */
export function arrange(els: El[], keepOrder = false): { els: El[]; w: number; h: number } {
  const items: Item[] = tidyable(els).map((el) => {
    const box = getBounds(el)
    return { el, box, w: box.maxX - box.minX, h: box.maxY - box.minY, scalable: el.type === 'image' }
  })
  if (!items.length) return { els: [], w: 0, h: 0 }
  const ordered = keepOrder ? items : readingOrder(items)
  const scalable = items.filter((i) => i.scalable)
  const fixedW = Math.max(0, ...items.filter((i) => !i.scalable).map((i) => i.w))
  const colW = snap8(Math.max(scalable.length ? median(scalable.map((i) => i.w)) : median(items.map((i) => i.w)), fixedW, 48))
  // the number of columns that makes the most pleasant landscape block
  let best: ReturnType<typeof masonry> | null = null
  let bestScore = Infinity
  for (let cols = 1; cols <= Math.min(items.length, 8); cols++) {
    const m = masonry(ordered, cols, colW)
    const score = Math.abs(Math.log(m.width / Math.max(m.height, 1) / 1.6))
    if (score < bestScore - 0.01) {
      best = m
      bestScore = score
    }
  }
  const out = best!.placed.map(({ item, x, y, w, h }) => {
    const to = { minX: x, minY: y, maxX: x + w, maxY: y + h }
    return item.scalable ? scaleEl(item.el, item.box, to, false) : translateEl(item.el, x - item.box.minX, y - item.box.minY)
  })
  return { els: out, w: best!.width, h: best!.height }
}

/** Move a laid-out block so its top-left sits at `at`. */
export function placeBlock(els: El[], at: Point) {
  return els.map((e) => translateEl(e, at[0], at[1]))
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Tidy the selection where it is, gliding things into place (one undo step). */
export function tidySelection() {
  const s = useStore.getState()
  const ids = new Set(s.selectedIds)
  const chosen = tidyable(s.doc.elements.filter((e) => ids.has(e.id)))
  if (chosen.length < 2) return
  const start = chosen.map(getBounds).reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }))
  const target = placeBlock(arrange(chosen).els, [snap8(start.minX), snap8(start.minY)])
  const byId = new Map(target.map((e) => [e.id, e]))
  const before = s.doc.elements
  const final = before.map((e) => byId.get(e.id) ?? e)
  if (still()) {
    s.commit(final, before)
    return
  }
  const from = new Map(chosen.map((e) => [e.id, getBounds(e)]))
  const to = new Map(target.map((e) => [e.id, getBounds(e)]))
  const t0 = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / 320)
    const k = 1 - Math.pow(1 - t, 3)
    if (t < 1) {
      const frame = before.map((e) => {
        const a = from.get(e.id)
        const b = to.get(e.id)
        if (!a || !b) return e
        const box = { minX: lerp(a.minX, b.minX, k), minY: lerp(a.minY, b.minY, k), maxX: lerp(a.maxX, b.maxX, k), maxY: lerp(a.maxY, b.maxY, k) }
        return e.type === 'image' ? scaleEl(e, a, box, false) : translateEl(e, box.minX - a.minX, box.minY - a.minY)
      })
      useStore.getState().setElementsLive(frame)
      requestAnimationFrame(step)
    } else {
      useStore.getState().commit(final, before)
    }
  }
  requestAnimationFrame(step)
}
