import { COLOR_KEYS } from './constants'
import { useStore } from './store'
import type { ColorKey, Tool } from './types'

/**
 * The Pencil menu: hold the Apple Pencil still on the board for a moment and
 * a round menu opens at its tip (tools, undo and colours). Safari doesn't pass
 * the Pencil's squeeze or double-tap to web pages, so a press-and-hold it is.
 */

export const HOLD_MS = 450
/** moving the Pencil further than this (screen px) before the menu opens is just drawing */
export const HOLD_SLOP = 6

export const MENU_TOOLS: { key: Tool | 'undo'; label: string }[] = [
  { key: 'pen', label: 'Pen' },
  { key: 'highlighter', label: 'Highlighter' },
  { key: 'eraser', label: 'Eraser' },
  { key: 'select', label: 'Select' },
  { key: 'undo', label: 'Undo' },
]
export const MENU_COLORS: ColorKey[] = COLOR_KEYS

/** Ring radii (px): tools on the inside, colours around them. */
export const INNER_R = 62
export const OUTER_R = 112
export const MENU_SIZE = (OUTER_R + 26) * 2

/** Position of item `i` of `n` on a ring, starting at the top, clockwise. */
export function ringPos(i: number, n: number, r: number) {
  const a = -Math.PI / 2 + (i / n) * Math.PI * 2
  return { x: Math.cos(a) * r, y: Math.sin(a) * r }
}

/** Keep the whole menu on screen. */
export function menuCenter(x: number, y: number) {
  const half = MENU_SIZE / 2
  return {
    x: Math.min(Math.max(x, half + 8), window.innerWidth - half - 8),
    y: Math.min(Math.max(y, half + 8), window.innerHeight - half - 8),
  }
}

/** Do what a Pencil menu item says. Keys: a tool, 'undo', or 'c:<colour>'. */
export function choosePencil(key: string) {
  const s = useStore.getState()
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
