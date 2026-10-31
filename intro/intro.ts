import { inject } from '@vercel/analytics'
import { getStroke } from 'perfect-freehand'
import { pageOnly } from '../src/analytics'
import './intro.css'

/**
 * The front page for new visitors (/intro/). Plain DOM and CSS for speed:
 * the headline writes itself in, board objects float and follow the pointer,
 * two scroll-driven scenes (ink that draws itself, a moodboard that tidies
 * itself) and live cursors. With "reduce motion" on, everything simply shows
 * its finished state.
 */

inject({ beforeSend: pageOnly })

const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)]
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const range = (p: number, a: number, b: number) => clamp((p - a) / (b - a))
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOutBack = (t: number) => {
  const c = 1.4
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

/* ---------- Opening the app ---------- */

// people who came through here have seen the intro; the app then skips its splash
for (const a of $$('[data-open]')) {
  a.addEventListener('click', () => {
    try {
      localStorage.setItem('canvas-intro-seen', '1')
    } catch {
      /* ignore */
    }
  })
}

/* ---------- Headline: letters rise and gain weight ---------- */

function splitLetters(root: Element) {
  let i = 0
  const walk = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment()
        for (const part of (child.textContent ?? '').split(/(\s+)/)) {
          if (!part) continue
          if (/^\s+$/.test(part)) {
            frag.append(' ')
            continue
          }
          const word = document.createElement('span')
          word.className = 'word'
          for (const ch of part) {
            const s = document.createElement('span')
            s.className = 'ch'
            s.textContent = ch
            s.style.setProperty('--i', String(i++))
            word.append(s)
          }
          frag.append(word)
        }
        child.replaceWith(frag)
      } else if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName !== 'svg') walk(child)
    }
  }
  walk(root)
  root.setAttribute('aria-label', root.textContent?.replace(/\s+/g, ' ').trim() ?? '')
}
for (const el of $$('[data-split]')) splitLetters(el)

/* ---------- Nav ---------- */

const nav = $('[data-nav]')
const onScrollNav = () => nav.classList.toggle('is-scrolled', window.scrollY > 12)
onScrollNav()

/* ---------- Hero: objects follow the pointer ---------- */

const hero = $('[data-hero]')
for (const f of $$('[data-depth]', hero)) f.style.setProperty('--depth', f.dataset.depth!)
const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
window.addEventListener(
  'pointermove',
  (e) => {
    if (e.pointerType !== 'mouse') return
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1
  },
  { passive: true },
)

// a collaborator's cursor wandering around the headline
const heroCursor = $('[data-hero-cursor]')
function moveHeroCursor(t: number) {
  const w = hero.clientWidth
  const h = hero.clientHeight
  const x = w * (0.5 + 0.34 * Math.sin(t * 0.00031) + 0.06 * Math.sin(t * 0.0011))
  const y = h * (0.52 + 0.26 * Math.sin(t * 0.00047 + 1.3) + 0.05 * Math.cos(t * 0.0013))
  heroCursor.style.transform = `translate(${x}px, ${y}px)`
}

/* ---------- Magnetic buttons ---------- */

for (const b of $$('[data-magnetic]')) {
  b.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || still) return
    const r = b.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    b.style.transform = `translate(${dx * 0.18}px, ${dy * 0.3}px)`
  })
  b.addEventListener('pointerleave', () => (b.style.transform = ''))
}

/* ---------- Text reveals ---------- */

const reveal = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      e.target.classList.add('is-in')
      reveal.unobserve(e.target)
    }
  },
  { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
)
for (const el of $$('[data-reveal]')) reveal.observe(el)

/* ---------- Scene: ink that draws itself ---------- */

function strokePath(stroke: number[][]) {
  if (!stroke.length) return ''
  const d = stroke.reduce<(string | number)[]>(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]
      acc.push(x0.toFixed(1), y0.toFixed(1), ((x0 + x1) / 2).toFixed(1), ((y0 + y1) / 2).toFixed(1))
      return acc
    },
    ['M', ...stroke[0].map((v) => v.toFixed(1)), 'Q'],
  )
  return `${d.join(' ')} Z`
}

const draw = $('[data-scene="draw"]')
const inkCenter = $<SVGPathElement>('[data-ink-center]')
const ink = $<SVGPathElement>('[data-ink]')
const pencil = $('[data-pencil]')
const paper = $('[data-paper]')
const inkSvg = $<SVGSVGElement>('.ink-svg')
const highlight = $('[data-ink-highlight]')
{
  // looping handwriting, faster on the upstrokes (thinner) and slower at the bottom (heavier)
  const pts: number[][] = []
  const N = 520
  const loops = 5.5
  for (let k = 0; k <= N; k++) {
    const s = k / N
    const u = s * Math.PI * 2 * loops
    // tall loops above a gently rising baseline, like joined-up "l"s
    const x = 60 + s * 640 - 38 * Math.sin(u)
    const tall = 0.8 + 0.2 * Math.sin(u / 2.3 + 0.6)
    const y = 330 - 130 * tall * (0.5 - 0.5 * Math.cos(u)) - s * 30
    // light on the upstrokes, heavier coming down
    const pressure = 0.3 + 0.55 * (0.5 + 0.5 * Math.sin(u + 0.4))
    pts.push([x, y, pressure])
  }
  // a little flourish to finish
  const [lx, ly] = pts[pts.length - 1]
  for (let k = 1; k <= 50; k++) {
    const s = k / 50
    pts.push([lx + s * 60, ly + Math.sin(s * Math.PI) * 26 - s * 50, 0.45 - s * 0.3])
  }
  ink.setAttribute('d', strokePath(getStroke(pts, { size: 15, thinning: 0.75, smoothing: 0.62, streamline: 0.3, simulatePressure: false, end: { taper: 120 }, start: { taper: 24 } })))
  inkCenter.setAttribute('d', `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')}`)
}

function updateDraw(p: number) {
  const t = easeInOut(range(p, 0.06, 0.66))
  inkCenter.style.setProperty('--draw', String(1 - t))
  highlight.style.setProperty('--hl', String(easeInOut(range(p, 0.66, 0.8))))
  paper.style.setProperty('--sticky-o', String(easeOutBack(range(p, 0.76, 0.88))))
  const drawing = t > 0.005 && t < 0.995
  paper.style.setProperty('--pencil-o', drawing ? '1' : '0')
  if (!drawing) return
  const len = inkCenter.getTotalLength()
  const pt = inkCenter.getPointAtLength(len * t)
  const m = inkSvg.getScreenCTM()
  if (!m) return
  const screen = new DOMPoint(pt.x, pt.y).matrixTransform(m)
  const r = paper.getBoundingClientRect()
  pencil.style.transform = `translate(${screen.x - r.left - 9}px, ${screen.y - r.top - 120}px) rotate(28deg)`
}

/* ---------- Scene: a moodboard tidies itself ---------- */

const tidy = $('[data-scene="tidy"]')
const stage = $('[data-stage]')
const items = $$('[data-item]', stage)
const tidyBtn = $('[data-tidy-btn]')
const tidyCursor = $('[data-tidy-cursor]')
// in stage units (stage width = 100): where things end up, and where they start
const TARGET: [number, number, number, number][] = [
  [5, 5, 27, 20],
  [5, 29.5, 27, 22],
  [36.5, 5, 27, 34],
  [36.5, 43.5, 8.4, 11],
  [45.8, 43.5, 8.4, 11],
  [55.1, 43.5, 8.4, 11],
  [68, 5, 27, 26],
  [68, 35.5, 27, 19.5],
]
const SCATTER: [number, number, number, number][] = [
  [9, 34, -10, 1],
  [58, 38, 8, 0.95],
  [28, 9, 6, 0.9],
  [79, 6, -15, 1.15],
  [13, 7, 11, 1.05],
  [47, 49, -7, 1.1],
  [61, 3, -4, 0.95],
  [22, 40, 13, 0.92],
]
function sizeItems() {
  const u = stage.clientWidth / 100
  items.forEach((el, i) => {
    el.style.width = `${TARGET[i][2] * u}px`
    el.style.height = `${TARGET[i][3] * u}px`
  })
}

function updateTidy(p: number) {
  const u = stage.clientWidth / 100
  items.forEach((el, i) => {
    const [tx, ty] = TARGET[i]
    const [sx, sy, sr, ss] = SCATTER[i]
    const k = easeOutBack(range(p, 0.46 + i * 0.024, 0.72 + i * 0.024))
    const drift = (1 - k) * Math.sin(p * 9 + i * 1.7) * 1.2
    const x = lerp(sx, tx, k) + drift
    const y = lerp(sy, ty, k) - drift * 0.6
    const r = lerp(sr, 0, k)
    const s = lerp(ss, 1, k)
    el.style.transform = `translate(${x * u}px, ${y * u}px) rotate(${r}deg) scale(${s})`
  })
  // a cursor comes in and taps Tidy up
  const h = stage.clientHeight
  const go = easeInOut(range(p, 0.18, 0.38))
  const cx = lerp(stage.clientWidth * 1.08, stage.clientWidth * 0.52, go)
  const cy = lerp(h * 1.25, h + 2, go)
  const leave = easeInOut(range(p, 0.52, 0.7))
  tidyCursor.style.transform = `translate(${lerp(cx, stage.clientWidth * 0.8, leave)}px, ${lerp(cy, h * 1.2, leave)}px)`
  tidyCursor.style.opacity = String(range(p, 0.16, 0.22) * (1 - range(p, 0.62, 0.7)))
  tidyBtn.style.setProperty('--press', p > 0.39 && p < 0.44 ? '0.92' : '1')
  tidyBtn.style.setProperty('--ripple', String(range(p, 0.41, 0.52)))
  const guides = range(p, 0.9, 0.93) * (1 - range(p, 0.97, 1))
  stage.style.setProperty('--guide-o', String(guides))
}

/* ---------- Together: live cursors drawing ---------- */

const board = $('[data-live-board]')
const canvas = $<HTMLCanvasElement>('[data-trails]')
const ctx = canvas.getContext('2d')!
const PEOPLE = [
  { name: 'You', color: '#0a84ff', ax: 0.3, ay: 0.28, fx: 0.00042, fy: 0.00061, ph: 0 },
  { name: 'Sam', color: '#ff9f0a', ax: 0.26, ay: 0.3, fx: 0.00055, fy: 0.00037, ph: 2.1 },
  { name: 'Mia', color: '#30d158', ax: 0.34, ay: 0.22, fx: 0.00033, fy: 0.00071, ph: 4.2 },
  { name: 'Leo', color: '#bf5af2', ax: 0.22, ay: 0.32, fx: 0.00067, fy: 0.00049, ph: 1.1 },
]
const cursors = PEOPLE.map((p) => {
  const c = document.createElement('div')
  c.className = 'cursor'
  c.style.setProperty('--c', p.color)
  c.innerHTML = `<svg viewBox="0 0 20 22"><path d="M1 1 L1 18 L5.5 13.6 L9 21 L12 19.7 L8.6 12.6 L15 12.6 Z"/></svg><span>${p.name}</span>`
  board.append(c)
  return { ...p, el: c, last: null as [number, number] | null }
})
function sizeCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = board.clientWidth * dpr
  canvas.height = board.clientHeight * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  for (const c of cursors) c.last = null
}
function updateTogether(t: number) {
  const w = board.clientWidth
  const h = board.clientHeight
  // older ink slowly fades away
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = 'rgba(0,0,0,0.014)'
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 4.5
  for (const c of cursors) {
    const x = w * (0.5 + c.ax * Math.sin(t * c.fx * 1.6 + c.ph) + 0.08 * Math.sin(t * c.fx * 3.1 + c.ph))
    const y = h * (0.52 + c.ay * Math.sin(t * c.fy * 1.6 + c.ph * 1.7) + 0.07 * Math.cos(t * c.fy * 2.7))
    if (c.last) {
      ctx.strokeStyle = c.color
      ctx.beginPath()
      ctx.moveTo(c.last[0], c.last[1])
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    c.last = [x, y]
    c.el.style.transform = `translate(${x}px, ${y}px)`
  }
}

/* ---------- One loop drives it all ---------- */

const visible = new Set<Element>()
const watch = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) visible.add(e.target)
    else visible.delete(e.target)
  }
  wake()
})
for (const el of [hero, draw, tidy, board]) watch.observe(el)

const progressOf = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return clamp(-r.top / Math.max(1, r.height - window.innerHeight))
}

let running = false
function frame(t: number) {
  running = false
  if (visible.has(hero)) {
    pointer.x += (pointer.tx - pointer.x) * 0.06
    pointer.y += (pointer.ty - pointer.y) * 0.06
    hero.style.setProperty('--mx', pointer.x.toFixed(4))
    hero.style.setProperty('--my', pointer.y.toFixed(4))
    moveHeroCursor(t)
  }
  if (visible.has(draw)) updateDraw(progressOf(draw))
  if (visible.has(tidy)) updateTidy(progressOf(tidy))
  if (visible.has(board)) updateTogether(t)
  // the hero and the live board animate on their own; scroll scenes only when scrolled
  if (visible.has(hero) || visible.has(board)) wake()
}
function wake() {
  if (running || still) return
  running = true
  requestAnimationFrame(frame)
}

function layout() {
  sizeItems()
  sizeCanvas()
  if (still) {
    // finished states, nothing moving
    updateDraw(1)
    updateTidy(1)
    moveHeroCursor(9000)
    return
  }
  wake()
}
window.addEventListener('resize', layout)
window.addEventListener(
  'scroll',
  () => {
    onScrollNav()
    wake()
  },
  { passive: true },
)
layout()
