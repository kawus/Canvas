import { LABEL_FONT, LINE_HEIGHT, STICKY_FONT } from './constants'
import { firstBaseline, textWidth } from './textMetrics'
import type { BoxEl, LinkEl, StickyEl } from './types'

/** Greedy word wrap; words longer than the line are broken by character. */
export function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const out: string[] = []
  const fits = (s: string) => textWidth(s, fontSize) <= maxWidth
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word
      if (fits(test)) {
        line = test
        continue
      }
      if (line) out.push(line)
      if (fits(word)) {
        line = word
        continue
      }
      // a single word wider than the line: break it by character
      let chunk = ''
      for (const ch of word) {
        if (chunk && !fits(chunk + ch)) {
          out.push(chunk)
          chunk = ch
        } else chunk += ch
      }
      line = chunk
    }
    out.push(line)
  }
  return out
}

export interface BoxTextLayout {
  fontSize: number
  lines: { text: string; x: number; y: number }[]
  /** inner text area in world units */
  inner: { x: number; y: number; w: number; h: number }
  /** top of the text block and its height */
  top: number
  height: number
}

const cache = new WeakMap<object, BoxTextLayout>()

/** Inner text area of a box-like element. */
export function textArea(el: BoxEl | StickyEl) {
  const w = Math.abs(el.w)
  const h = Math.abs(el.h)
  if (el.type === 'sticky') {
    const pad = Math.min(16, w * 0.1, h * 0.1)
    return { x: el.x + pad, y: el.y + pad, w: Math.max(w - pad * 2, 1), h: Math.max(h - pad * 2, 1) }
  }
  if (el.type === 'ellipse') {
    // largest comfortable rectangle inside an ellipse
    const iw = w * 0.72
    const ih = h * 0.72
    return { x: el.x + (w - iw) / 2, y: el.y + (h - ih) / 2, w: Math.max(iw, 1), h: Math.max(ih, 1) }
  }
  const pad = Math.min(12, w * 0.1, h * 0.1)
  return { x: el.x + pad, y: el.y + pad, w: Math.max(w - pad * 2, 1), h: Math.max(h - pad * 2, 1) }
}

/** Centered, wrapped text that shrinks until it fits the element. */
export function boxTextLayout(el: BoxEl | StickyEl): BoxTextLayout {
  const cached = cache.get(el)
  if (cached) return cached
  const inner = textArea(el)
  const text = el.text ?? ''
  const base = el.fontSize ?? (el.type === 'sticky' ? STICKY_FONT : LABEL_FONT)
  let fontSize = base
  let lines = wrapText(text, fontSize, inner.w)
  while (fontSize > 8 && lines.length * fontSize * LINE_HEIGHT > inner.h) {
    fontSize = Math.max(8, fontSize * 0.92)
    lines = wrapText(text, fontSize, inner.w)
  }
  const lh = fontSize * LINE_HEIGHT
  const height = lines.length * lh
  const top = inner.y + (inner.h - height) / 2
  const base0 = firstBaseline(fontSize)
  const cx = inner.x + inner.w / 2
  const layout: BoxTextLayout = {
    fontSize,
    inner,
    top,
    height,
    lines: lines.map((t, i) => ({ text: t, x: cx - textWidth(t, fontSize) / 2, y: top + base0 + i * lh })),
  }
  cache.set(el, layout)
  return layout
}

/* ---------- Link cards ---------- */

export interface CardText {
  text: string
  x: number
  y: number
  size: number
  muted: boolean
}

export interface LinkLayout {
  image: { x: number; y: number; w: number; h: number } | null
  lines: CardText[]
}

const linkCache = new WeakMap<object, LinkLayout>()
export const CARD_INSET = 6
const CARD_PAD = 12

/** Shorten a line with an ellipsis until it fits. */
function ellipsize(line: string, size: number, maxWidth: number) {
  if (textWidth(line, size) <= maxWidth) return line
  let s = line
  while (s.length > 1 && textWidth(`${s}…`, size) > maxWidth) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}

/** Preview image on top, then title (2 lines), description and the site name at the bottom. */
export function linkLayout(el: LinkEl): LinkLayout {
  const cached = linkCache.get(el)
  if (cached) return cached
  const w = Math.abs(el.w)
  const h = Math.abs(el.h)
  const textW = Math.max(w - CARD_PAD * 2, 10)
  const imgH = el.image ? Math.min((w - CARD_INSET * 2) * 0.56, h * 0.62) : 0
  const image = el.image ? { x: el.x + CARD_INSET, y: el.y + CARD_INSET, w: w - CARD_INSET * 2, h: imgH } : null
  const lines: CardText[] = []
  const bottom = el.y + h - CARD_PAD
  const siteSize = 11.5
  const siteTop = bottom - siteSize * LINE_HEIGHT
  let top = el.y + (image ? CARD_INSET + imgH + 10 : CARD_PAD)

  const block = (text: string, size: number, muted: boolean, maxLines: number) => {
    const lh = size * LINE_HEIGHT
    const room = Math.floor((siteTop - 4 - top) / lh)
    const n = Math.min(maxLines, room)
    if (n <= 0 || !text) return
    const wrapped = wrapText(text.replace(/\s+/g, ' ').trim(), size, textW)
    const shown = wrapped.slice(0, n)
    // more text than room: end the last line with an ellipsis
    if (wrapped.length > n) shown[n - 1] = ellipsize(`${shown[n - 1]} ${wrapped[n]}`, size, textW)
    const base = firstBaseline(size)
    shown.forEach((t, i) => lines.push({ text: t, x: el.x + CARD_PAD, y: top + base + i * lh, size, muted }))
    top += shown.length * lh + 4
  }
  block(el.title || el.url, 15, false, 2)
  block(el.description ?? '', 12.5, true, 3)
  lines.push({
    text: ellipsize(el.site || hostOf(el.url), siteSize, textW),
    x: el.x + CARD_PAD,
    y: siteTop + firstBaseline(siteSize),
    size: siteSize,
    muted: true,
  })
  const layout = { image, lines }
  linkCache.set(el, layout)
  return layout
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
