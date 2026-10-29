import { getStroke } from 'perfect-freehand'
import { FILL_OPACITY, FONT_STACK, PEN_SIZE, STROKE_WIDTH, type Palette } from './constants'
import { firstBaseline } from './textMetrics'
import { LINE_HEIGHT } from './constants'
import type { El, FreedrawEl } from './types'

/**
 * A render primitive is a tiny, framework-free description of an SVG node.
 * The live canvas renders these with React and exports serialize them to
 * markup, so the board and its PDF/PNG/SVG exports can never drift apart.
 */
export type Attrs = Record<string, string | number>
export type Prim =
  | { tag: 'path' | 'rect' | 'ellipse' | 'circle'; attrs: Attrs }
  | { tag: 'text'; attrs: Attrs; lines: { x: number; y: number; text: string }[] }

const pathCache = new WeakMap<FreedrawEl, string>()

const avg = (a: number, b: number) => (a + b) / 2

function outlineToPath(points: number[][]) {
  const len = points.length
  if (len < 4) return ''
  let a = points[0]
  let b = points[1]
  const c = points[2]
  let d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${avg(b[0], c[0]).toFixed(2)},${avg(b[1], c[1]).toFixed(2)} T`
  for (let i = 2; i < len - 1; i++) {
    a = points[i]
    b = points[i + 1]
    d += `${avg(a[0], b[0]).toFixed(2)},${avg(a[1], b[1]).toFixed(2)} `
  }
  return d + 'Z'
}

export function freedrawPath(el: FreedrawEl, complete = true) {
  const cached = pathCache.get(el)
  if (cached !== undefined) return cached
  const outline = getStroke(el.points, {
    size: PEN_SIZE[el.size],
    thinning: el.pressure ? 0.65 : 0.55,
    smoothing: 0.55,
    streamline: el.pressure ? 0.35 : 0.5,
    simulatePressure: !el.pressure,
    easing: (t) => t,
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true },
    last: complete,
  })
  const d = outlineToPath(outline)
  pathCache.set(el, d)
  return d
}

export function elementPrims(el: El, palette: Palette): Prim[] {
  const color = palette[el.color]
  switch (el.type) {
    case 'freedraw': {
      const d = freedrawPath(el)
      if (!d) {
        const [x, y] = el.points[0]
        return [{ tag: 'circle', attrs: { cx: x, cy: y, r: PEN_SIZE[el.size] / 2, fill: color } }]
      }
      return [{ tag: 'path', attrs: { d, fill: color } }]
    }
    case 'rect':
    case 'ellipse': {
      const sw = STROKE_WIDTH[el.size]
      const fill = el.fill === 'none' ? 'none' : color
      const common: Attrs = {
        stroke: color,
        strokeWidth: sw,
        fill,
        strokeLinejoin: 'round',
      }
      if (el.fill !== 'none') common.fillOpacity = FILL_OPACITY[el.fill]
      if (el.type === 'rect') {
        const r = Math.min(8, Math.abs(el.w) / 4, Math.abs(el.h) / 4)
        return [{ tag: 'rect', attrs: { x: el.x, y: el.y, width: el.w, height: el.h, rx: r, ry: r, ...common } }]
      }
      return [
        {
          tag: 'ellipse',
          attrs: { cx: el.x + el.w / 2, cy: el.y + el.h / 2, rx: el.w / 2, ry: el.h / 2, ...common },
        },
      ]
    }
    case 'line':
    case 'arrow': {
      const sw = STROKE_WIDTH[el.size]
      const common: Attrs = { stroke: color, strokeWidth: sw, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
      let d = `M${el.x1},${el.y1} L${el.x2},${el.y2}`
      if (el.type === 'arrow') {
        const len = Math.hypot(el.x2 - el.x1, el.y2 - el.y1)
        if (len > 0.5) {
          const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1)
          const head = Math.min(Math.max(12, sw * 4), len * 0.6)
          const spread = Math.PI / 7
          const ax = el.x2 - head * Math.cos(angle - spread)
          const ay = el.y2 - head * Math.sin(angle - spread)
          const bx = el.x2 - head * Math.cos(angle + spread)
          const by = el.y2 - head * Math.sin(angle + spread)
          d += ` M${ax},${ay} L${el.x2},${el.y2} L${bx},${by}`
        }
      }
      return [{ tag: 'path', attrs: { d, ...common } }]
    }
    case 'text': {
      const lh = el.fontSize * LINE_HEIGHT
      const base = firstBaseline(el.fontSize)
      const lines = el.text.split('\n').map((text, i) => ({ x: el.x, y: el.y + base + i * lh, text }))
      return [
        {
          tag: 'text',
          attrs: { fontFamily: FONT_STACK, fontSize: el.fontSize, fill: color },
          lines,
        },
      ]
    }
  }
}

const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function primToMarkup(p: Prim): string {
  const attrs = Object.entries(p.attrs)
    .map(([k, v]) => `${kebab(k)}="${esc(String(v))}"`)
    .join(' ')
  if (p.tag === 'text') {
    const spans = p.lines
      .map((l) => `<tspan x="${l.x}" y="${l.y}">${esc(l.text) || ' '}</tspan>`)
      .join('')
    return `<text ${attrs} xml:space="preserve">${spans}</text>`
  }
  return `<${p.tag} ${attrs}/>`
}
