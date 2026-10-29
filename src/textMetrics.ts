import { FONT_FAMILY, LINE_HEIGHT } from './constants'

let ctx: CanvasRenderingContext2D | null = null
const widthCache = new Map<string, number>()
let ascentRatio = 0.93
let descentRatio = 0.22

function context() {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')
  return ctx!
}

/** Call once the web font has loaded so measurements match what is rendered. */
export function calibrateFont() {
  widthCache.clear()
  const c = context()
  c.font = `100px ${FONT_FAMILY}`
  const m = c.measureText('Hg')
  if (m.fontBoundingBoxAscent && m.fontBoundingBoxDescent) {
    ascentRatio = m.fontBoundingBoxAscent / 100
    descentRatio = m.fontBoundingBoxDescent / 100
  }
}

/** Width of a single line at 100px; scaled linearly for other sizes. */
function lineWidth100(line: string) {
  let w = widthCache.get(line)
  if (w === undefined) {
    const c = context()
    c.font = `100px ${FONT_FAMILY}`
    w = c.measureText(line).width
    if (widthCache.size > 5000) widthCache.clear()
    widthCache.set(line, w)
  }
  return w
}

export function textWidth(line: string, fontSize: number) {
  return (lineWidth100(line) * fontSize) / 100
}

export function measureText(text: string, fontSize: number) {
  const lines = text.split('\n')
  let max = 0
  for (const line of lines) max = Math.max(max, lineWidth100(line))
  return {
    width: (max * fontSize) / 100,
    height: lines.length * fontSize * LINE_HEIGHT,
    lines,
  }
}

/** Baseline offset of the first line from the top of the text box (matches CSS line-height layout). */
export function firstBaseline(fontSize: number) {
  const lh = fontSize * LINE_HEIGHT
  const content = (ascentRatio + descentRatio) * fontSize
  return (lh - content) / 2 + ascentRatio * fontSize
}
