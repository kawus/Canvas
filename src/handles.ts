import { geometricBounds } from './geometry'
import type { Box, El, LineEl, Viewport } from './types'

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'p1' | 'p2'

export interface Handle {
  id: HandleId
  x: number
  y: number
  cursor: string
}

export const HANDLE_DIR: Record<Exclude<HandleId, 'p1' | 'p2'>, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
}

const CURSORS: Record<string, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}

export const toScreen = (v: Viewport, x: number, y: number): [number, number] => [x * v.zoom + v.x, y * v.zoom + v.y]
export const toWorld = (v: Viewport, x: number, y: number): [number, number] => [(x - v.x) / v.zoom, (y - v.y) / v.zoom]

/** Screen-space padding between the selection frame and the geometry */
export const FRAME_PAD = 6

export function isSingleLine(sel: El[]): sel is [LineEl] {
  return sel.length === 1 && (sel[0].type === 'line' || sel[0].type === 'arrow')
}

export function selectionFrame(sel: El[], v: Viewport): Box | null {
  const b = geometricBounds(sel)
  if (!b) return null
  const [x0, y0] = toScreen(v, b.minX, b.minY)
  const [x1, y1] = toScreen(v, b.maxX, b.maxY)
  return { minX: x0 - FRAME_PAD, minY: y0 - FRAME_PAD, maxX: x1 + FRAME_PAD, maxY: y1 + FRAME_PAD }
}

/** Handles in screen coordinates for the current selection. */
export function getHandles(sel: El[], v: Viewport): Handle[] {
  if (!sel.length) return []
  if (isSingleLine(sel)) {
    const el = sel[0]
    const [ax, ay] = toScreen(v, el.x1, el.y1)
    const [bx, by] = toScreen(v, el.x2, el.y2)
    return [
      { id: 'p1', x: ax, y: ay, cursor: 'move' },
      { id: 'p2', x: bx, y: by, cursor: 'move' },
    ]
  }
  const f = selectionFrame(sel, v)!
  const cx = (f.minX + f.maxX) / 2
  const cy = (f.minY + f.maxY) / 2
  const corners: Handle[] = [
    { id: 'nw', x: f.minX, y: f.minY, cursor: CURSORS.nw },
    { id: 'ne', x: f.maxX, y: f.minY, cursor: CURSORS.ne },
    { id: 'se', x: f.maxX, y: f.maxY, cursor: CURSORS.se },
    { id: 'sw', x: f.minX, y: f.maxY, cursor: CURSORS.sw },
  ]
  const textOnly = sel.every((e) => e.type === 'text')
  const w = f.maxX - f.minX
  const h = f.maxY - f.minY
  if (textOnly) return corners
  const edges: Handle[] = []
  if (w > 56) {
    edges.push({ id: 'n', x: cx, y: f.minY, cursor: CURSORS.n }, { id: 's', x: cx, y: f.maxY, cursor: CURSORS.s })
  }
  if (h > 56) {
    edges.push({ id: 'e', x: f.maxX, y: cy, cursor: CURSORS.e }, { id: 'w', x: f.minX, y: cy, cursor: CURSORS.w })
  }
  return [...corners, ...edges]
}

export function hitHandle(handles: Handle[], x: number, y: number, slop: number): Handle | null {
  let best: Handle | null = null
  let bestD = slop
  for (const h of handles) {
    const d = Math.hypot(h.x - x, h.y - y)
    if (d <= bestD) {
      best = h
      bestD = d
    }
  }
  return best
}
