import type { ColorKey, FillKey, FontSizeKey, SizeKey } from './types'

export const COLOR_KEYS: ColorKey[] = ['ink', 'gray', 'red', 'orange', 'yellow', 'green', 'blue', 'violet']

export type Palette = Record<ColorKey, string>

/** Apple system colors, tuned per theme. Exports always use the light palette. */
export const PALETTE_LIGHT: Palette = {
  ink: '#1d1d1f',
  gray: '#8e8e93',
  red: '#ff3b30',
  orange: '#ff9500',
  yellow: '#f5b800',
  green: '#34c759',
  blue: '#007aff',
  violet: '#af52de',
}

export const PALETTE_DARK: Palette = {
  ink: '#f5f5f7',
  gray: '#98989d',
  red: '#ff453a',
  orange: '#ff9f0a',
  yellow: '#ffd60a',
  green: '#30d158',
  blue: '#0a84ff',
  violet: '#bf5af2',
}

/** Pastel paper colors for sticky notes (same in light and dark mode) */
export const STICKY_FILL: Palette = {
  ink: '#e8e8ea',
  gray: '#d5d5da',
  red: '#ffcdc8',
  orange: '#ffdcb0',
  yellow: '#fff2a8',
  green: '#c9f0d1',
  blue: '#cfe2ff',
  violet: '#e9d8fb',
}
export const STICKY_INK = '#1d1d1f'
export const STICKY_SIZE = 200
export const STICKY_FONT = 22
/** Default label size inside shapes */
export const LABEL_FONT = 20

export const COLOR_NAMES: Record<ColorKey, string> = {
  ink: 'Ink',
  gray: 'Gray',
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  violet: 'Violet',
}

/** Stroke width for shapes and lines */
export const STROKE_WIDTH: Record<SizeKey, number> = { s: 2, m: 3.5, l: 6 }
/** Base diameter for freehand strokes */
export const PEN_SIZE: Record<SizeKey, number> = { s: 3, m: 6, l: 12 }
export const FONT_SIZE: Record<FontSizeKey, number> = { s: 16, m: 24, l: 36, xl: 56 }

export const FILL_OPACITY: Record<FillKey, number> = { none: 0, tint: 0.16, solid: 1 }

export const FONT_FAMILY = 'Geist'
export const FONT_STACK = `${FONT_FAMILY}, ui-sans-serif, system-ui, -apple-system, sans-serif`
export const LINE_HEIGHT = 1.25

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8

export const ACCENT = '#0a84ff'
