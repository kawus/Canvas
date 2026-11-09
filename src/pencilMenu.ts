import { COLOR_KEYS } from './constants'
import { useStore } from './store'
import type { ColorKey, Tool } from './types'

/**
 * The Pencil menu: hold the Apple Pencil still on the board for a moment and
 * a ring of six choices opens at its tip (Safari doesn't pass the Pencil's
 * squeeze or double-tap to web pages, so it's a press-and-hold).
 *
 * Like Procreate's QuickMenu, picking goes by direction: flick toward a
 * segment and lift. Like Feather's squeeze menu, it stays small: the colours
 * only fan out when you move onto the colour segment.
 */

export const HOLD_MS = 450
/** moving the Pencil further than this (screen px) before the menu opens is just drawing */
export const HOLD_SLOP = 6

export type MenuKey = Tool | 'undo' | 'color'

/** Fixed places, clockwise from the top, so they become muscle memory. */
export const SEGMENTS: { key: MenuKey; label: string }[] = [
  { key: 'pen', label: 'Pen' },
  { key: 'highlighter', label: 'Highlighter' },
  { key: 'eraser', label: 'Eraser' },
  { key: 'select', label: 'Select' },
  { key: 'undo', label: 'Undo' },
  { key: 'color', label: 'Colour' },
]
export const MENU_COLORS: ColorKey[] = COLOR_KEYS

/** Geometry (px): the ring, the dead zone in the middle, and the colour arc beyond the ring. */
export const RING_IN = 36
export const RING_OUT = 96
export const DEAD_ZONE = 22
export const COLOR_R = 128
export const SWATCH = 30
/** the colour arc spreads this far either side of the colour segment */
export const COLOR_SPREAD = (75 * Math.PI) / 180
export const MENU_SIZE = (COLOR_R + SWATCH) * 2

const TAU = Math.PI * 2
const STEP = TAU / SEGMENTS.length
/** angle of a segment's middle (0 = up, clockwise) */
export const segmentAngle = (i: number) => i * STEP
const COLOR_INDEX = SEGMENTS.findIndex((s) => s.key === 'color')

/** Angle of colour swatch i on the arc around the colour segment. */
export function swatchAngle(i: number) {
  const n = MENU_COLORS.length
  return segmentAngle(COLOR_INDEX) - COLOR_SPREAD + (i / (n - 1)) * COLOR_SPREAD * 2
}

/** A point at `r` from the centre, at angle `a` (0 = up, clockwise). */
export const polar = (a: number, r: number) => ({ x: Math.sin(a) * r, y: -Math.cos(a) * r })

const norm = (a: number) => ((a % TAU) + TAU) % TAU
const gap = (a: number, b: number) => {
  const d = Math.abs(norm(a) - norm(b))
  return Math.min(d, TAU - d)
}

/**
 * What's chosen with the Pencil at this offset from the centre: nothing in the
 * middle, then whichever segment it points toward. With the colour arc open,
 * anywhere toward the arc keeps it open, and going out past the ring picks the
 * nearest colour; back in the middle folds the colours away.
 */
export function pickAt(dx: number, dy: number, colorsOpen: boolean): string | null {
  const d = Math.hypot(dx, dy)
  if (d < DEAD_ZONE) return null
  const a = norm(Math.atan2(dx, -dy))
  // with the colours out, their whole arc belongs to them (the way out crosses neighbouring segments)
  if (colorsOpen && gap(a, segmentAngle(COLOR_INDEX)) <= COLOR_SPREAD + STEP / 4) {
    if (d <= RING_OUT + 6) return 'color'
    let best = -1
    let bestGap = Infinity
    MENU_COLORS.forEach((_, i) => {
      const g = gap(a, swatchAngle(i))
      if (g < bestGap) {
        bestGap = g
        best = i
      }
    })
    if (best >= 0 && bestGap < STEP / 1.5) return `c:${MENU_COLORS[best]}`
  }
  return SEGMENTS[Math.round(a / STEP) % SEGMENTS.length].key
}

export function labelFor(key: string | null) {
  if (!key) return null
  if (key.startsWith('c:')) {
    const c = key.slice(2)
    return c.charAt(0).toUpperCase() + c.slice(1)
  }
  return SEGMENTS.find((s) => s.key === key)?.label ?? null
}

/** Keep the whole menu (colour arc included) on screen. */
export function menuCenter(x: number, y: number) {
  const half = MENU_SIZE / 2
  return {
    x: Math.min(Math.max(x, half + 4), window.innerWidth - half - 4),
    y: Math.min(Math.max(y, half + 4), window.innerHeight - half - 4),
  }
}

/** Do what a Pencil menu choice says. Keys: a tool, 'undo', 'color' (shows the colours) or 'c:<colour>'. */
export function choosePencil(key: string) {
  const s = useStore.getState()
  const menu = s.pencilMenu
  if (key === 'color') {
    if (menu) s.setPencilMenu({ ...menu, colors: true, active: null })
    return
  }
  if (key === 'undo') s.undo()
  else if (key.startsWith('c:')) {
    const color = key.slice(2) as ColorKey
    // a colour is for the Pencil: nothing selected gets recoloured
    if (s.selectedIds.length) s.select([])
    if (s.tool === 'highlighter') s.setStyle({ highlightColor: color })
    else {
      s.setStyle({ color })
      if (s.tool !== 'pen') s.setTool('pen')
    }
  } else s.setTool(key as Tool)
  s.setPencilMenu(null)
}
