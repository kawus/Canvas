import { getStroke } from 'perfect-freehand'
import {
  FILL_OPACITY,
  FONT_STACK,
  LINE_HEIGHT,
  PEN_SIZE,
  STICKY_FILL,
  STICKY_INK,
  STROKE_WIDTH,
  type Palette,
} from './constants'
import { boxTextLayout } from './layout'
import { firstBaseline } from './textMetrics'
import type { BoxEl, El, FreedrawEl, StickyEl, StrokePoint } from './types'

/**
 * A render primitive is a tiny, framework-free description of an SVG node.
 * The live canvas renders these with React and exports serialize them to
 * markup, so the board and its PDF/PNG/SVG exports can never drift apart.
 */
export type Attrs = Record<string, string | number>
export type Prim =
  | { tag: 'path' | 'rect' | 'ellipse' | 'circle' | 'image'; attrs: Attrs }
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

/**
 * Fast strokes arrive as sparse points; joining them with straight segments
 * looks jagged. Fill long gaps with a centripetal Catmull-Rom curve (which
 * passes through every real point without overshooting) before outlining.
 */
function smoothPoints(pts: StrokePoint[], step: number): StrokePoint[] {
  if (pts.length < 3) return pts
  const out: StrokePoint[] = [pts[0]]
  const last = pts.length - 1
  for (let i = 0; i < last; i++) {
    const p0 = pts[Math.max(i - 1, 0)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(i + 2, last)]
    const n = Math.min(48, Math.floor(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step))
    for (let k = 1; k < n; k++) out.push(catmullRom(p0, p1, p2, p3, k / n))
    out.push(p2)
  }
  return out
}

function catmullRom(p0: StrokePoint, p1: StrokePoint, p2: StrokePoint, p3: StrokePoint, t: number): StrokePoint {
  const knot = (a: StrokePoint, b: StrokePoint) => Math.max(Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])), 1e-4)
  const t1 = knot(p0, p1)
  const t2 = t1 + knot(p1, p2)
  const t3 = t2 + knot(p2, p3)
  const u = t1 + (t2 - t1) * t
  const lerp = (a: number[], b: number[], ta: number, tb: number) => {
    const w = (u - ta) / (tb - ta)
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w]
  }
  const a1 = lerp(p0, p1, 0, t1)
  const a2 = lerp(p1, p2, t1, t2)
  const a3 = lerp(p2, p3, t2, t3)
  const b1 = lerp(a1, a2, 0, t2)
  const b2 = lerp(a2, a3, t1, t3)
  const [x, y] = lerp(b1, b2, t1, t2)
  return [x, y, p1[2] + (p2[2] - p1[2]) * t]
}

export function freedrawPath(el: FreedrawEl, complete = true) {
  const cached = pathCache.get(el)
  if (cached !== undefined) return cached
  const outline = getStroke(smoothPoints(el.points, Math.max(1.5, PEN_SIZE[el.size] * 0.3)), {
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

function labelPrims(el: BoxEl | StickyEl, fill: string): Prim[] {
  if (!el.text) return []
  const l = boxTextLayout(el)
  return [{ tag: 'text', attrs: { fontFamily: FONT_STACK, fontSize: l.fontSize, fill }, lines: l.lines }]
}

/** Label colour on a shape: readable on solid fills, otherwise the shape's own colour. */
export function labelColor(el: BoxEl, palette: Palette) {
  if (el.fill !== 'solid') return palette[el.color]
  if (el.color === 'yellow') return STICKY_INK
  // ink is near-black in light mode and near-white in dark mode
  if (el.color === 'ink') return palette.ink === STICKY_INK ? '#ffffff' : STICKY_INK
  return '#ffffff'
}

export function elementPrims(el: El, palette: Palette, assetUrl?: (hash: string) => string | undefined): Prim[] {
  const color = el.type === 'image' ? '' : palette[el.color]
  switch (el.type) {
    case 'sticky':
      return [
        {
          tag: 'rect',
          attrs: {
            className: 'sticky-paper',
            x: el.x,
            y: el.y,
            width: el.w,
            height: el.h,
            rx: 4,
            ry: 4,
            fill: STICKY_FILL[el.color],
            stroke: '#000000',
            strokeOpacity: 0.06,
            strokeWidth: 1,
          },
        },
        ...labelPrims(el, STICKY_INK),
      ]
    case 'image': {
      const href = assetUrl?.(el.asset)
      if (!href) {
        return [
          {
            tag: 'rect',
            attrs: { x: el.x, y: el.y, width: el.w, height: el.h, rx: 4, ry: 4, fill: '#8e8e93', fillOpacity: 0.16 },
          },
        ]
      }
      return [
        {
          tag: 'image',
          attrs: { href, x: el.x, y: el.y, width: el.w, height: el.h, preserveAspectRatio: 'none' },
        },
      ]
    }
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
      const label = labelPrims(el, labelColor(el, palette))
      if (el.type === 'rect') {
        const r = Math.min(8, Math.abs(el.w) / 4, Math.abs(el.h) / 4)
        return [{ tag: 'rect', attrs: { x: el.x, y: el.y, width: el.w, height: el.h, rx: r, ry: r, ...common } }, ...label]
      }
      return [
        {
          tag: 'ellipse',
          attrs: { cx: el.x + el.w / 2, cy: el.y + el.h / 2, rx: el.w / 2, ry: el.h / 2, ...common },
        },
        ...label,
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

const kebab = (k: string) => (k === 'className' ? 'class' : k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()))
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
