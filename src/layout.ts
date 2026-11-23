import { LABEL_FONT, LINE_HEIGHT, STICKY_FONT } from './constants'
import { mediaOf } from './media'
import { firstBaseline, textWidth } from './textMetrics'
import type { BoxEl, LinkEl, StickyEl, TextEl } from './types'

/** Greedy word wrap; words longer than the line are broken by character. */
export function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  return wrapTextAt(text, fontSize, maxWidth).map((l) => l.text)
}

/** wrapText, also noting where each line starts in the text (so a link split over two lines stays one link). */
export function wrapTextAt(text: string, fontSize: number, maxWidth: number): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = []
  const fits = (s: string) => textWidth(s, fontSize) <= maxWidth
  let pos = 0
  for (const para of text.split('\n')) {
    let line = ''
    let lineStart = pos
    let at = pos
    for (const word of para.split(' ')) {
      const wordStart = at
      at += word.length + 1
      const test = line ? `${line} ${word}` : word
      if (fits(test)) {
        if (!line) lineStart = wordStart
        line = test
        continue
      }
      if (line) out.push({ text: line, start: lineStart })
      if (fits(word)) {
        line = word
        lineStart = wordStart
        continue
      }
      // a single word wider than the line: break it by character
      let chunk = ''
      let chunkStart = wordStart
      let i = wordStart
      for (const ch of word) {
        if (chunk && !fits(chunk + ch)) {
          out.push({ text: chunk, start: chunkStart })
          chunk = ch
          chunkStart = i
        } else chunk += ch
        i += ch.length
      }
      line = chunk
      lineStart = chunkStart
    }
    out.push({ text: line, start: lineStart })
    pos += para.length + 1
  }
  return out
}

/** A list line in a note or label: "[ ] " or "[x] " (a checkbox), or "- ", "* ", "• " (a bullet). */
export const LIST_RE = /^\s*(\[(?: |x|X)?\]|[-*•])\s+/

export interface ListMark {
  kind: 'box' | 'done' | 'dot'
  /** the mark's square, in world units */
  x: number
  y: number
  size: number
  /** which line of the text (as typed) it belongs to */
  para: number
}

export interface BoxTextLayout {
  fontSize: number
  lines: { text: string; x: number; y: number; done?: boolean; start?: number }[]
  /** checkboxes and bullets, when the text has list lines */
  marks?: ListMark[]
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
  if (text.split('\n').some((p) => LIST_RE.test(p))) {
    const layout = listLayout(text, base, inner)
    cache.set(el, layout)
    return layout
  }
  let fontSize = base
  let lines = wrapTextAt(text, fontSize, inner.w)
  while (fontSize > 8 && lines.length * fontSize * LINE_HEIGHT > inner.h) {
    fontSize = Math.max(8, fontSize * 0.92)
    lines = wrapTextAt(text, fontSize, inner.w)
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
    lines: lines.map((t, i) => ({ text: t.text, start: t.start, x: cx - textWidth(t.text, fontSize) / 2, y: top + base0 + i * lh })),
  }
  cache.set(el, layout)
  return layout
}

/**
 * A note or label with list lines: a tidy list, left-aligned and centred as a block,
 * with checkboxes and bullets drawn in front and long items wrapping under their text.
 */
function listLayout(text: string, base: number, inner: BoxTextLayout['inner']): BoxTextLayout {
  type Row = { text: string; start: number; indent: boolean; para: number; first: boolean; kind?: ListMark['kind'] }
  const rowsAt = (fontSize: number) => {
    const indent = fontSize * 1.3
    const rows: Row[] = []
    let pos = 0
    text.split('\n').forEach((para, i) => {
      const m = LIST_RE.exec(para)
      if (!m) {
        for (const t of wrapTextAt(para, fontSize, inner.w)) rows.push({ text: t.text, start: pos + t.start, indent: false, para: i, first: false })
      } else {
        const kind: ListMark['kind'] = m[1].startsWith('[') ? (/x/i.test(m[1]) ? 'done' : 'box') : 'dot'
        const from = pos + m[0].length
        wrapTextAt(para.slice(m[0].length), fontSize, inner.w - indent).forEach((t, k) => rows.push({ text: t.text, start: from + t.start, indent: true, para: i, first: k === 0, kind }))
      }
      pos += para.length + 1
    })
    return rows
  }
  let fontSize = base
  let rows = rowsAt(fontSize)
  while (fontSize > 8 && rows.length * fontSize * LINE_HEIGHT > inner.h) {
    fontSize = Math.max(8, fontSize * 0.92)
    rows = rowsAt(fontSize)
  }
  const indent = fontSize * 1.3
  const lh = fontSize * LINE_HEIGHT
  const height = rows.length * lh
  const top = inner.y + (inner.h - height) / 2
  const base0 = firstBaseline(fontSize)
  const blockW = Math.min(inner.w, Math.max(...rows.map((r) => (r.indent ? indent : 0) + textWidth(r.text, fontSize))))
  const left = inner.x + (inner.w - blockW) / 2
  const size = fontSize * 0.78
  const marks: ListMark[] = []
  const lines = rows.map((r, i) => {
    const y = top + base0 + i * lh
    if (r.first && r.kind) marks.push({ kind: r.kind, x: left, y: y - fontSize * 0.36 - size / 2, size, para: r.para })
    return { text: r.text, start: r.start, x: left + (r.indent ? indent : 0), y, ...(r.kind === 'done' ? { done: true } : {}) }
  })
  return { fontSize, inner, top, height, lines, marks }
}

/** A note or label's checkbox under a point (with some room around it for fingers). */
export function checkboxAt(el: BoxEl | StickyEl, p: [number, number], slack: number): ListMark | null {
  if (!el.text || !el.text.includes('[')) return null
  const l = boxTextLayout(el)
  for (const m of l.marks ?? []) {
    if (m.kind === 'dot') continue
    const pad = Math.max(slack, m.size * 0.4)
    if (p[0] >= m.x - pad && p[0] <= m.x + m.size + pad && p[1] >= m.y - pad && p[1] <= m.y + m.size + pad) return m
  }
  return null
}

/** The text with one checkbox ticked or unticked (its line, as typed). */
export function toggledText(text: string, para: number) {
  return text
    .split('\n')
    .map((line, i) => (i === para ? line.replace(/^(\s*)\[( |x|X)?\]/, (_, sp, mark) => `${sp}[${mark && mark !== ' ' ? ' ' : 'x'}]`) : line))
    .join('\n')
}

/* ---------- Web addresses in notes, text and labels ---------- */

export interface TextLink {
  url: string
  /** the underlined stretch of one line, in world units */
  x: number
  y: number
  w: number
  fontSize: number
}

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"]+/gi
const textLinkCache = new WeakMap<object, TextLink[]>()

/** The web addresses written in a note, a text or a label, where they sit (one entry per line they cover). */
export function textLinks(el: BoxEl | StickyEl | TextEl): TextLink[] {
  const cached = textLinkCache.get(el)
  if (cached) return cached
  const text = el.text ?? ''
  const out: TextLink[] = []
  if (/https?:\/\/|www\./i.test(text)) {
    const spans: { a: number; b: number; url: string }[] = []
    for (const m of text.matchAll(URL_RE)) {
      const raw = m[0].replace(/[.,;:!?)\]'"]+$/, '')
      if (raw.length < 5) continue
      spans.push({ a: m.index ?? 0, b: (m.index ?? 0) + raw.length, url: /^www\./i.test(raw) ? `https://${raw}` : raw })
    }
    let fontSize: number
    let lines: { text: string; x: number; y: number; start?: number }[]
    if (el.type === 'text') {
      fontSize = el.fontSize
      const lh = el.fontSize * LINE_HEIGHT
      const base = firstBaseline(el.fontSize)
      let pos = 0
      lines = text.split('\n').map((t, i) => {
        const line = { text: t, x: el.x, y: el.y + base + i * lh, start: pos }
        pos += t.length + 1
        return line
      })
    } else {
      const l = boxTextLayout(el)
      fontSize = l.fontSize
      lines = l.lines
    }
    for (const line of lines) {
      if (line.start === undefined) continue
      const end = line.start + line.text.length
      for (const s of spans) {
        const a = Math.max(s.a, line.start)
        const b = Math.min(s.b, end)
        if (b <= a) continue
        const x = line.x + textWidth(line.text.slice(0, a - line.start), fontSize)
        out.push({ url: s.url, x, y: line.y, w: textWidth(line.text.slice(a - line.start, b - line.start), fontSize), fontSize })
      }
    }
  }
  textLinkCache.set(el, out)
  return out
}

/** The web address under a point in a note, text or label, if there is one. */
export function linkAt(el: BoxEl | StickyEl | TextEl, p: [number, number], slack: number): string | null {
  for (const l of textLinks(el)) {
    if (p[0] >= l.x - slack && p[0] <= l.x + l.w + slack && p[1] >= l.y - l.fontSize * 0.95 - slack && p[1] <= l.y + l.fontSize * 0.3 + slack) return l.url
  }
  return null
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
  /** videos and music: the play button (centre and radius) */
  play: { x: number; y: number; r: number } | null
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
  // videos and music always have a picture area (it's where they play); music covers are square
  const media = mediaOf(el.url, el.player)
  const hasArt = !!el.image || !!media
  const artW = w - CARD_INSET * 2
  const imgH = !hasArt
    ? 0
    : media?.shape === 'square'
      ? Math.min(artW, h * 0.72)
      : media?.shape === 'tall'
        ? Math.min((artW * 16) / 9, h * 0.8)
        : Math.min(artW * 0.56, h * 0.62)
  const image = hasArt ? { x: el.x + CARD_INSET, y: el.y + CARD_INSET, w: artW, h: imgH } : null
  // videos and music are the service's own player and maps open when tapped: no play button of our own
  const play: LinkLayout['play'] = null

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
  block(el.description ?? '', 12.5, true, media?.kind === 'audio' ? 1 : 3)
  lines.push({
    text: ellipsize(el.site || hostOf(el.url), siteSize, textW),
    x: el.x + CARD_PAD,
    y: siteTop + firstBaseline(siteSize),
    size: siteSize,
    muted: true,
  })
  const layout = { image, lines, play }
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
