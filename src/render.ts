import { getStroke } from 'perfect-freehand'
import {
  FILL_OPACITY,
  FONT_STACK,
  HIGHLIGHT_OPACITY,
  HIGHLIGHT_SCALE,
  LINE_HEIGHT,
  PEN_SIZE,
  STICKY_FILL,
  STICKY_INK,
  STROKE_WIDTH,
  type Palette,
} from './constants'
import { boxTextLayout, CARD_INSET, linkLayout } from './layout'
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

/**
 * A smooth closed path along the outline: from midpoint to midpoint, each piece
 * bending toward the outline point between them (a quadratic B-spline). Every
 * curve uses a real outline point as its control, so unevenly spaced points
 * never make kinks (the "T" shorthand guesses each bend by mirroring the last).
 */
function outlineToPath(points: number[][]) {
  const len = points.length
  if (len < 4) return ''
  const f = (n: number) => n.toFixed(2)
  const mid = (i: number) => {
    const a = points[i % len]
    const b = points[(i + 1) % len]
    return `${f(avg(a[0], b[0]))},${f(avg(a[1], b[1]))}`
  }
  let d = `M${mid(0)}`
  for (let i = 1; i <= len; i++) {
    const c = points[i % len]
    d += `Q${f(c[0])},${f(c[1])} ${mid(i)}`
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

/**
 * Clean up raw pen input before it becomes an outline. An Apple Pencil reports
 * ~240 samples a second with a fraction of a pixel of tremor, and its pressure
 * flickers from one sample to the next. Fed straight in, every wobble becomes
 * a bump in the outline, which shows as jagged edges once you zoom in. So:
 * samples that crowd together are thinned out, the path is gently smoothed
 * (ends stay put), and pressure is smoothed so the width swells gradually.
 * Only the drawing is affected; the saved points are untouched.
 */
function steadyPoints(pts: StrokePoint[], size: number): StrokePoint[] {
  if (pts.length < 3) return pts
  // 1. thin out samples closer together than a fraction of the stroke width
  const minGap = Math.max(0.3, size * 0.08)
  const kept: StrokePoint[] = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const last = kept[kept.length - 1]
    if (Math.hypot(pts[i][0] - last[0], pts[i][1] - last[1]) >= minGap) kept.push(pts[i])
  }
  kept.push(pts[pts.length - 1])
  if (kept.length < 3) return kept
  // distance along the stroke at each point
  const along = [0]
  for (let i = 1; i < kept.length; i++) along.push(along[i - 1] + Math.hypot(kept[i][0] - kept[i - 1][0], kept[i][1] - kept[i - 1][1]))
  const total = along[along.length - 1]
  // 2. smooth position and pressure along the stroke (a Gaussian over a stretch tied to the pen
  //    width: tremor goes, while any rounding of corners stays hidden inside the line itself).
  //    Near the ends the stretch shrinks, so the stroke starts and ends exactly where it did.
  const sigmaXY = Math.max(0.9, size * 0.33)
  const sigmaP = Math.max(3, size * 1.5)
  const out: StrokePoint[] = []
  let lo = 0
  for (let i = 0; i < kept.length; i++) {
    const room = Math.min(along[i], total - along[i])
    const sx = Math.min(sigmaXY, room / 2.5)
    const reach = Math.max(sx, sigmaP) * 2.5
    while (along[lo] < along[i] - reach) lo++
    let wx = 0, x = 0, y = 0, wp = 0, pr = 0
    for (let k = lo; k < kept.length && along[k] <= along[i] + reach; k++) {
      const d = along[k] - along[i]
      const gp = Math.exp(-(d * d) / (2 * sigmaP * sigmaP))
      wp += gp
      pr += kept[k][2] * gp
      if (sx > 0.01 && Math.abs(d) <= sx * 2.5) {
        const g = Math.exp(-(d * d) / (2 * sx * sx))
        wx += g
        x += kept[k][0] * g
        y += kept[k][1] * g
      }
    }
    out.push(wx > 0 ? [x / wx, y / wx, pr / wp] : [kept[i][0], kept[i][1], pr / wp])
  }
  return out
}

export function freedrawPath(el: FreedrawEl, complete = true) {
  const cached = pathCache.get(el)
  if (cached !== undefined) return cached
  const size = PEN_SIZE[el.size] * (el.highlight ? HIGHLIGHT_SCALE : 1)
  const outline = getStroke(smoothPoints(steadyPoints(el.points, size), Math.max(1.5, size * 0.3)), {
    size,
    // a highlighter keeps an even width
    thinning: el.highlight ? 0 : el.pressure ? 0.65 : 0.55,
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

/** Card surface for link cards and swatches; light in exports, dark in dark mode. */
function cardPrim(el: { x: number; y: number; w: number; h: number }, dark: boolean): Prim {
  return {
    tag: 'rect',
    attrs: {
      className: 'card-paper',
      x: el.x,
      y: el.y,
      width: el.w,
      height: el.h,
      rx: 10,
      ry: 10,
      fill: dark ? '#2a2a2d' : '#ffffff',
      stroke: dark ? '#ffffff' : '#000000',
      strokeOpacity: dark ? 0.1 : 0.08,
      strokeWidth: 1,
    },
  }
}

export function elementPrims(el: El, palette: Palette, assetUrl?: (hash: string) => string | undefined): Prim[] {
  const color = palette[el.color]
  // ink is near-white only in the dark palette
  const dark = palette.ink !== STICKY_INK
  switch (el.type) {
    // slide frames are drawn by the editor overlay only, never in exports or previews
    case 'slide':
      return []
    case 'link': {
      const l = linkLayout(el)
      const out: Prim[] = [cardPrim(el, dark)]
      if (l.image) {
        const href = el.image ? assetUrl?.(el.image) : undefined
        out.push(
          href
            ? { tag: 'image', attrs: { href, x: l.image.x, y: l.image.y, width: l.image.w, height: l.image.h, preserveAspectRatio: 'xMidYMid slice' } }
            : { tag: 'rect', attrs: { x: l.image.x, y: l.image.y, width: l.image.w, height: l.image.h, rx: 6, ry: 6, fill: '#8e8e93', fillOpacity: 0.14 } },
        )
      }
      for (const line of l.lines) {
        out.push({
          tag: 'text',
          attrs: { fontFamily: FONT_STACK, fontSize: line.size, fill: line.muted ? palette.gray : palette.ink },
          lines: [{ text: line.text, x: line.x, y: line.y }],
        })
      }
      return out
    }
    case 'swatch': {
      const labelSize = 13
      const labelH = 30
      return [
        cardPrim(el, dark),
        {
          tag: 'rect',
          attrs: {
            x: el.x + CARD_INSET,
            y: el.y + CARD_INSET,
            width: Math.max(el.w - CARD_INSET * 2, 1),
            height: Math.max(el.h - CARD_INSET - labelH, 1),
            rx: 6,
            ry: 6,
            fill: el.hex,
          },
        },
        {
          tag: 'text',
          attrs: { fontFamily: FONT_STACK, fontSize: labelSize, fill: palette.ink },
          lines: [{ text: el.hex.toUpperCase(), x: el.x + 10, y: el.y + el.h - labelH / 2 + labelSize * 0.36 }],
        },
      ]
    }
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
        const r = (PEN_SIZE[el.size] * (el.highlight ? HIGHLIGHT_SCALE : 1)) / 2
        return [{ tag: 'circle', attrs: el.highlight ? { cx: x, cy: y, r, fill: color, fillOpacity: HIGHLIGHT_OPACITY } : { cx: x, cy: y, r, fill: color } }]
      }
      return [{ tag: 'path', attrs: el.highlight ? { d, fill: color, fillOpacity: HIGHLIGHT_OPACITY } : { d, fill: color } }]
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

/** Markup for exports. Boards can come from anyone, so every value is escaped. */
export function primToMarkup(p: Prim): string {
  const attrs = Object.entries(p.attrs)
    .map(([k, v]) => `${kebab(k)}="${esc(String(v))}"`)
    .join(' ')
  if (p.tag === 'text') {
    const spans = p.lines
      .map((l) => `<tspan x="${esc(String(l.x))}" y="${esc(String(l.y))}">${esc(l.text) || ' '}</tspan>`)
      .join('')
    return `<text ${attrs} xml:space="preserve">${spans}</text>`
  }
  return `<${p.tag} ${attrs}/>`
}
