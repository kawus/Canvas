export type ColorKey = 'ink' | 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet'
export type SizeKey = 's' | 'm' | 'l'
export type FillKey = 'none' | 'tint' | 'solid'
export type FontSizeKey = 's' | 'm' | 'l' | 'xl'

export type Point = [number, number]
/** x, y, pressure (0..1) */
export type StrokePoint = [number, number, number]

interface Base {
  id: string
  color: ColorKey
}

export interface FreedrawEl extends Base {
  type: 'freedraw'
  points: StrokePoint[]
  size: SizeKey
  /** true when the input device reported real pressure (Apple Pencil, pen tablets) */
  pressure: boolean
}

export interface BoxEl extends Base {
  type: 'rect' | 'ellipse'
  x: number
  y: number
  w: number
  h: number
  size: SizeKey
  fill: FillKey
}

export interface LineEl extends Base {
  type: 'line' | 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
  size: SizeKey
}

export interface TextEl extends Base {
  type: 'text'
  x: number
  y: number
  text: string
  /** absolute font size in world units */
  fontSize: number
}

export type El = FreedrawEl | BoxEl | LineEl | TextEl
export type ElType = El['type']

export type Tool =
  | 'select'
  | 'hand'
  | 'pen'
  | 'eraser'
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'text'

export interface Viewport {
  /** screen-space offset of the world origin */
  x: number
  y: number
  zoom: number
}

export interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface Style {
  color: ColorKey
  size: SizeKey
  fill: FillKey
  fontSize: FontSizeKey
}

export interface BoardDoc {
  id: string
  title: string
  elements: El[]
  createdAt: number
  updatedAt: number
}

export interface BoardMeta {
  id: string
  title: string
  updatedAt: number
  count: number
}
