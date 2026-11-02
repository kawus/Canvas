import { ChevronLeft, ChevronRight, LayoutGrid, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Palette } from '../constants'
import { contentOf, unionBounds } from '../geometry'
import { touchFirst } from '../platform'
import { slideBox, slidesOf, stopPresenting } from '../slides'
import { dotSpacing } from '../snap'
import { useStore } from '../store'
import type { Box } from '../types'
import { ElementView } from './Canvas'

/**
 * Presentation mode. Each slide fills the screen; moving to the next one flies
 * the camera across the board: it pulls back far enough to show where you are
 * and where you're going (a spotlight glides along with it), then zooms in.
 * The show opens by zooming in from the whole board and ends on an overview.
 */

/** A camera: the world point in the middle of the screen, and how much world fits across it. */
type Cam = [cx: number, cy: number, w: number]

const DIM = 0.62 // how far the board outside the current slide fades back
const RHO = 1.9 // how much a move pulls back (higher = further out)

const vw = () => window.innerWidth
const vh = () => window.innerHeight

function fit(b: Box, margin: number): Cam {
  const bw = Math.max(b.maxX - b.minX, 1)
  const bh = Math.max(b.maxY - b.minY, 1)
  const zoom = Math.min((vw() * (1 - margin)) / bw, (vh() * (1 - margin)) / bh)
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, vw() / zoom]
}

/**
 * Smooth zoom-and-pan between two views (van Wijk & Nuij, "Smooth and
 * efficient zooming and panning"): the path a map takes when it flies you
 * somewhere — out, across, and back in. Returns the path and its natural length.
 */
function flight(a: Cam, b: Cam): { at: (t: number) => Cam; length: number } {
  const [ux0, uy0, w0] = a
  const [ux1, uy1, w1] = b
  const dx = ux1 - ux0
  const dy = uy1 - uy0
  const d2 = dx * dx + dy * dy
  const rho2 = RHO * RHO
  const rho4 = rho2 * rho2
  if (d2 < 1e-6 * w0 * w0) {
    const S = Math.log(w1 / w0) / RHO
    return { at: (t) => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(RHO * t * S)], length: Math.abs(S) }
  }
  const d1 = Math.sqrt(d2)
  const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1)
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1)
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0)
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1)
  const S = (r1 - r0) / RHO
  const coshr0 = Math.cosh(r0)
  const sinhr0 = Math.sinh(r0)
  return {
    at: (t) => {
      const s = t * S
      const u = (w0 / (rho2 * d1)) * (coshr0 * Math.tanh(RHO * s + r0) - sinhr0)
      return [ux0 + u * dx, uy0 + u * dy, (w0 * coshr0) / Math.cosh(RHO * s + r0)]
    },
    length: S,
  }
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Where the presentation is: a slide (by position in the show) or the overview. */
type Spot = number | 'overview'

interface Look {
  cam: Cam
  /** the part of the board in the spotlight, and how much the rest fades */
  lit: Box
  dim: number
}

export function Presenter({ palette }: { palette: Palette }) {
  const from = useStore((s) => s.presenting)
  const elements = useStore((s) => s.doc.elements)
  const slides = slidesOf(elements)
  const content = contentOf(elements)

  const [spot, setSpot] = useState<Spot>(() => Math.min(from ?? 0, Math.max(slides.length - 1, 0)))
  const [moving, setMoving] = useState(true)
  const [chrome, setChrome] = useState(true)
  const [, setSize] = useState(0)

  const world = useRef<SVGGElement>(null)
  const dots = useRef<SVGPatternElement>(null)
  const hole = useRef<SVGRectElement>(null)
  const oldHole = useRef<SVGRectElement>(null)
  const veil = useRef<SVGRectElement>(null)
  const ring = useRef<SVGRectElement>(null)
  const look = useRef<Look | null>(null)
  const frame = useRef(0)
  const slidesRef = useRef(slides)
  slidesRef.current = slides
  const contentRef = useRef(content)
  contentRef.current = content

  /** The whole board, slides included. */
  const boardBox = useCallback((): Box => {
    const all = [...contentRef.current, ...slidesRef.current]
    return unionBounds(all) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  }, [])

  const lookOf = useCallback(
    (s: Spot): Look => {
      if (s === 'overview') {
        const b = boardBox()
        return { cam: fit(b, 0.16), lit: b, dim: 0 }
      }
      const slide = slidesRef.current[s]
      if (!slide) return lookOf('overview')
      return { cam: fit(slideBox(slide), 0), lit: slideBox(slide), dim: DIM }
    },
    [boardBox],
  )

  /** Draws one moment: camera, dots, spotlight. Runs every frame, outside React. */
  const paint = useCallback((l: Look, ringAlpha: number, leaving?: { box: Box; alpha: number }) => {
    look.current = l
    const [cx, cy, w] = l.cam
    const zoom = vw() / w
    const x = vw() / 2 - cx * zoom
    const y = vh() / 2 - cy * zoom
    world.current?.setAttribute('transform', `translate(${x} ${y}) scale(${zoom})`)
    const gap = dotSpacing(zoom) * zoom
    const p = dots.current
    if (p) {
      p.setAttribute('width', String(gap))
      p.setAttribute('height', String(gap))
      p.setAttribute('x', String((((x % gap) + gap) % gap) - 1))
      p.setAttribute('y', String((((y % gap) + gap) % gap) - 1))
    }
    const place = (el: SVGRectElement | null, b: Box) => {
      el?.setAttribute('x', String(b.minX * zoom + x))
      el?.setAttribute('y', String(b.minY * zoom + y))
      el?.setAttribute('width', String(Math.max((b.maxX - b.minX) * zoom, 0)))
      el?.setAttribute('height', String(Math.max((b.maxY - b.minY) * zoom, 0)))
    }
    place(hole.current, l.lit)
    place(ring.current, l.lit)
    // the slide you're leaving stays lit for a moment, then fades back with the rest
    place(oldHole.current, leaving?.box ?? l.lit)
    oldHole.current?.setAttribute('fill-opacity', String(leaving?.alpha ?? 0))
    hole.current?.setAttribute('fill-opacity', String(leaving ? 1 - leaving.alpha : 1))
    veil.current?.setAttribute('fill-opacity', String(l.dim))
    ring.current?.setAttribute('stroke-opacity', String(ringAlpha))
  }, [])

  /** Fly from wherever the camera is now to a spot. */
  const travel = useCallback(
    (to: Spot, opts?: { instant?: boolean; delay?: number }) => {
      cancelAnimationFrame(frame.current)
      const target = lookOf(to)
      const start = look.current
      if (!start || opts?.instant) {
        paint(target, 0)
        setMoving(false)
        return
      }
      const path = flight(start.cam, target.cam)
      // longer trips take a little longer, within limits
      const duration = Math.min(2800, Math.max(1200, path.length * 800))
      const t0 = performance.now() + (opts?.delay ?? 0)
      setMoving(true)
      const step = (now: number) => {
        const raw = Math.max(0, Math.min(1, (now - t0) / duration))
        const t = ease(raw)
        // the spotlight outline shows only mid-flight
        const ringAlpha = to === 'overview' ? 0 : Math.sin(Math.PI * raw) * 0.9
        // the spotlight fades from the slide you're on to the one you're going to
        const fade = Math.min(1, Math.max(0, (t - 0.15) / 0.7))
        paint(
          { cam: path.at(t), lit: target.lit, dim: lerp(start.dim, target.dim, t) },
          ringAlpha,
          raw < 1 ? { box: start.lit, alpha: 1 - fade } : undefined,
        )
        if (raw < 1) frame.current = requestAnimationFrame(step)
        else setMoving(false)
      }
      frame.current = requestAnimationFrame(step)
    },
    [lookOf, paint],
  )

  // opening: start on the whole board, then zoom in to the first slide
  useLayoutEffect(() => {
    const first = lookOf(spot)
    paint({ ...lookOf('overview'), lit: first.lit }, 0)
    travel(spot, { delay: 280 })
    return () => cancelAnimationFrame(frame.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const go = useCallback(
    (to: Spot) => {
      setSpot(to)
      travel(to)
    },
    [travel],
  )

  const count = slides.length
  const next = useCallback(() => {
    if (spot === 'overview') return
    go(spot + 1 < count ? spot + 1 : 'overview')
  }, [spot, count, go])
  const prev = useCallback(() => {
    if (spot === 'overview') go(Math.max(count - 1, 0))
    else if (spot > 0) go(spot - 1)
  }, [spot, count, go])

  // slides removed by someone else while presenting
  useEffect(() => {
    if (!count) stopPresenting()
    else if (spot !== 'overview' && spot >= count) go(count - 1)
  }, [count, spot, go])

  // the controls fade away while you talk; moving the mouse brings them back
  const idle = useRef(0)
  const wake = useCallback(() => {
    setChrome(true)
    clearTimeout(idle.current)
    // touch screens have no hover to bring them back, so there they stay
    if (!touchFirst) idle.current = window.setTimeout(() => setChrome(false), 2600)
  }, [])
  useEffect(() => {
    wake()
    return () => clearTimeout(idle.current)
  }, [wake])

  // keys: arrows, space, page up/down (presentation clickers send those), Esc to stop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key
      let handled = true
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter' || k === 'n') next()
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace' || k === 'p') prev()
      else if (k === 'Home') go(0)
      else if (k === 'End') go(count - 1)
      else if (k === 'o' || k === 'g') go(spot === 'overview' ? 0 : 'overview')
      else if (k === 'Escape') stopPresenting()
      else handled = false
      if (handled) e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [next, prev, go, count, spot])

  // a new window size (or entering full screen): stay put on the current spot
  useEffect(() => {
    const onResize = () => {
      setSize((n) => n + 1)
      travel(spot, { instant: true })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [spot, travel])

  // leaving full screen (Esc in the browser) ends the show
  useEffect(() => {
    const onChange = () => {
      const d = document as Document & { webkitFullscreenElement?: Element | null }
      if (!(d.fullscreenElement ?? d.webkitFullscreenElement)) stopPresenting(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  // no page zoom or scrolling under the show
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const stop = (e: Event) => e.preventDefault()
    el.addEventListener('wheel', stop, { passive: false })
    el.addEventListener('gesturestart', stop)
    return () => {
      el.removeEventListener('wheel', stop)
      el.removeEventListener('gesturestart', stop)
    }
  }, [])

  // tap or click: forward (the left edge goes back); swipe sideways on touch screens
  const press = useRef<{ x: number; y: number } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    press.current = { x: e.clientX, y: e.clientY }
  }
  const onUp = (e: React.PointerEvent) => {
    const p = press.current
    press.current = null
    if (!p) return
    wake()
    if (spot === 'overview') return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? next() : prev()
    if (Math.hypot(dx, dy) > 12 || e.button > 0) return
    if (e.clientX < vw() * 0.28) prev()
    else next()
  }

  const overview = spot === 'overview'
  const settled = overview && !moving && look.current
  const cam = look.current?.cam
  const zoom = cam ? vw() / cam[2] : 1
  const toScreen = (b: Box) => {
    const [cx, cy] = cam!
    const x = vw() / 2 - cx * zoom
    const y = vh() / 2 - cy * zoom
    return { left: b.minX * zoom + x, top: b.minY * zoom + y, width: (b.maxX - b.minX) * zoom, height: (b.maxY - b.minY) * zoom }
  }
  const showChrome = chrome || overview

  return (
    <div
      ref={root}
      className={`presenter ${showChrome ? '' : 'is-quiet'}`}
      data-testid="presenter"
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerMove={(e) => e.pointerType === 'mouse' && wake()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg className="presenter-stage" width="100%" height="100%" aria-hidden>
        <defs>
          <pattern ref={dots} id="present-dots" patternUnits="userSpaceOnUse" width={18} height={18}>
            <circle cx={1} cy={1} r={1} className="dot" />
          </pattern>
          <mask id="present-spot">
            <rect width="100%" height="100%" fill="#fff" />
            <rect ref={oldHole} rx={4} fill="#000" fillOpacity={0} />
            <rect ref={hole} rx={4} fill="#000" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#present-dots)" />
        <g ref={world}>
          {content.map((el) => (
            <ElementView key={el.id} el={el} palette={palette} faded={false} editing={false} />
          ))}
        </g>
        <rect ref={veil} className="presenter-veil" width="100%" height="100%" mask="url(#present-spot)" fillOpacity={0} />
        <rect ref={ring} className="presenter-ring" rx={4} strokeOpacity={0} />
      </svg>

      {settled && (
        <>
          <div className="presenter-hint">Overview — {touchFirst ? 'tap' : 'click'} a slide to jump there</div>
          {slides.map((s, i) => {
            const r = toScreen(slideBox(s))
            return (
              <button
                key={s.id}
                type="button"
                className="presenter-pick"
                style={r}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={() => go(i)}
                aria-label={`Go to slide ${i + 1}`}
                data-testid="presenter-pick"
              >
                <span className="presenter-tag">{i + 1}</span>
              </button>
            )
          })}
        </>
      )}

      <div className="presenter-bar" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} data-testid="presenter-bar">
        <button type="button" aria-label="Previous slide" onClick={prev} disabled={spot === 0} data-testid="presenter-prev">
          <ChevronLeft />
        </button>
        {count <= 12 ? (
          <span className="presenter-dots" aria-label={overview ? 'Overview' : `Slide ${(spot as number) + 1} of ${count}`}>
            {slides.map((s, i) => (
              <i key={s.id} className={i === spot ? 'is-on' : ''} onClick={() => go(i)} />
            ))}
          </span>
        ) : (
          <span className="presenter-count">{overview ? `${count} slides` : `${(spot as number) + 1} / ${count}`}</span>
        )}
        <button type="button" aria-label="Next slide" onClick={next} disabled={overview} data-testid="presenter-next">
          <ChevronRight />
        </button>
        <span className="presenter-sep" />
        <button
          type="button"
          aria-label="Overview"
          className={overview ? 'is-on' : ''}
          onClick={() => go(overview ? 0 : 'overview')}
          data-testid="presenter-overview"
        >
          <LayoutGrid />
        </button>
        <button type="button" aria-label="Stop presenting" onClick={() => stopPresenting()} data-testid="presenter-close">
          <X />
        </button>
      </div>
    </div>
  )
}
