import { toScreen, toWorld } from './handles'
import { newElementId } from './storage'
import { useStore } from './store'
import type { Box, El, SlideEl, Viewport } from './types'

/**
 * Slides: 16:9 parts of the board, played one after another in presentation
 * mode. They are ordinary board elements (so they save, sync and undo like
 * everything else) that are only ever drawn as frames while editing.
 */

const S = () => useStore.getState()

export const isSlide = (el: El): el is SlideEl => el.type === 'slide'

/** The board's slides in slideshow order. */
export function slidesOf(els: El[]): SlideEl[] {
  const out = els.filter(isSlide)
  // stable: slides with the same place (e.g. duplicated) keep their board order
  return out.length > 1 ? out.map((s, i) => [s, i] as const).sort((a, b) => a[0].order - b[0].order || a[1] - b[1]).map(([s]) => s) : out
}

export const slideBox = (s: SlideEl): Box => ({ minX: s.x, minY: s.y, maxX: s.x + s.w, maxY: s.y + s.h })

/** Room the app's own bars take up around the board, so a new slide frames what you can actually see. */
function visibleArea(): Box {
  const w = window.innerWidth
  const h = window.innerHeight
  // below the top bar, with room for the slide's number
  const top = 100
  const bottom = w < 600 ? 132 : 92
  const side = w < 600 ? 16 : 48
  return { minX: side, minY: top, maxX: w - side, maxY: h - bottom }
}

/** Adds a slide framing what's on screen now, and selects it. */
export function addSlide() {
  const s = S()
  if (!s.doc.key) return
  const a = visibleArea()
  let w = a.maxX - a.minX
  let h = (w * 9) / 16
  if (h > a.maxY - a.minY) {
    h = a.maxY - a.minY
    w = (h * 16) / 9
  }
  const cx = (a.minX + a.maxX) / 2
  const cy = (a.minY + a.maxY) / 2
  const v = s.viewport
  const [x0, y0] = toWorld(v, cx - w / 2, cy - h / 2)
  const ww = Math.round(w / v.zoom)
  const slides = slidesOf(s.doc.elements)
  const slide: SlideEl = {
    id: newElementId(),
    type: 'slide',
    color: 'blue',
    x: Math.round(x0),
    y: Math.round(y0),
    w: ww,
    h: Math.round((ww * 9) / 16),
    name: `Slide ${slides.length + 1}`,
    order: slides.length ? Math.max(...slides.map((x) => x.order)) + 1 : 0,
  }
  s.commit([...s.doc.elements, slide])
  if (s.tool !== 'select') s.setTool('select')
  S().select([slide.id])
  return slide
}

/** Puts the slides in this order (ids, first to last). */
export function reorderSlides(ids: string[]) {
  const s = S()
  const place = new Map(ids.map((id, i) => [id, i]))
  let changed = false
  const elements = s.doc.elements.map((e) => {
    const i = place.get(e.id)
    if (e.type !== 'slide' || i === undefined || e.order === i) return e
    changed = true
    return { ...e, order: i }
  })
  if (changed) s.commit(elements)
}

/** Brings a slide into view in the editor (with room around it) and selects it. */
export function showSlide(slide: SlideEl) {
  const s = S()
  const a = visibleArea()
  const zoom = Math.min((a.maxX - a.minX) / slide.w, (a.maxY - a.minY) / slide.h) * 0.9
  const cx = (a.minX + a.maxX) / 2
  const cy = (a.minY + a.maxY) / 2
  glide(s.viewport, { zoom, x: cx - (slide.x + slide.w / 2) * zoom, y: cy - (slide.y + slide.h / 2) * zoom })
  if (s.doc.key) {
    if (s.tool !== 'select') s.setTool('select')
    S().select([slide.id])
  }
}

let glideFrame = 0
/** A short, smooth camera move in the editor. */
function glide(from: Viewport, to: Viewport) {
  cancelAnimationFrame(glideFrame)
  const t0 = performance.now()
  const dur = 420
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / dur)
    const e = 1 - Math.pow(1 - t, 3)
    // zoom eases in log space, so it feels even whether zooming in or out
    const zoom = Math.exp(lerp(Math.log(from.zoom), Math.log(to.zoom), e))
    // keep the target's centre gliding in a straight line on screen
    const w = window.innerWidth / 2
    const h = window.innerHeight / 2
    const fx = (w - from.x) / from.zoom
    const fy = (h - from.y) / from.zoom
    const tx = (w - to.x) / to.zoom
    const ty = (h - to.y) / to.zoom
    const cx = lerp(fx, tx, e)
    const cy = lerp(fy, ty, e)
    S().setViewport({ zoom, x: w - cx * zoom, y: h - cy * zoom })
    if (t < 1) glideFrame = requestAnimationFrame(step)
  }
  glideFrame = requestAnimationFrame(step)
}

/* ---------- the numbered tag drawn above each slide while editing ---------- */

export const TAG_H = 22
const TAG_GAP = 6

export interface SlideTag {
  slide: SlideEl
  number: number
  /** top-left of the tag on screen (it's a circle, TAG_H across) */
  x: number
  y: number
  w: number
  /** the slide's outline on screen */
  frame: { x: number; y: number; w: number; h: number }
}

/** Where each slide's outline and number sit on screen. */
export function slideTags(els: El[], v: Viewport): SlideTag[] {
  return slidesOf(els).map((slide, i) => {
    const [x0, y0] = toScreen(v, slide.x, slide.y)
    const [x1, y1] = toScreen(v, slide.x + slide.w, slide.y + slide.h)
    return { slide, number: i + 1, x: x0, y: y0 - TAG_H - TAG_GAP, w: TAG_H, frame: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } }
  })
}

/** The slide whose number tag is at this screen point. */
export function slideTagAt(els: El[], v: Viewport, sx: number, sy: number, slop = 0): SlideEl | null {
  if (!els.some(isSlide)) return null
  const tags = slideTags(els, v)
  for (let i = tags.length - 1; i >= 0; i--) {
    const t = tags[i]
    if (sx >= t.x - slop && sx <= t.x + t.w + slop && sy >= t.y - slop && sy <= t.y + TAG_H + slop) return t.slide
  }
  return null
}

/* ---------- playing ---------- */

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void }

const fullscreenEl = () => (document as FsDoc).fullscreenElement ?? (document as FsDoc).webkitFullscreenElement ?? null
let wentFullscreen = false

/** Starts the show (call it straight from a click: browsers only allow full screen then). */
export function startPresenting(from = 0) {
  const s = S()
  if (!slidesOf(s.doc.elements).length) return
  // full screen where the browser can (not on iPhone, nor in the Home Screen app, which already is)
  const root = document.documentElement as FsEl
  wentFullscreen = false
  if (!fullscreenEl()) {
    try {
      const p = root.requestFullscreen?.({ navigationUI: 'hide' }) ?? root.webkitRequestFullscreen?.()
      if (p instanceof Promise) p.then(() => (wentFullscreen = true)).catch(() => {})
      else if (root.webkitRequestFullscreen) wentFullscreen = true
    } catch {
      /* fine: the show fills the window instead */
    }
  }
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  s.setPresenting(from)
}

export function stopPresenting(leaveFullscreen = true) {
  if (S().presenting === null) return
  S().setPresenting(null)
  if (leaveFullscreen && wentFullscreen && fullscreenEl()) {
    const d = document as FsDoc
    void (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.())?.catch?.(() => {})
  }
  wentFullscreen = false
}
