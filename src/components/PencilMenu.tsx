import { Eraser, Highlighter, MousePointer2, Pencil, Undo2 } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { COLOR_NAMES, COLOR_KEYS, type Palette } from '../constants'
import {
  choosePencil,
  COLOR_R,
  labelFor,
  MENU_COLORS,
  MENU_SIZE,
  polar,
  RING_IN,
  RING_OUT,
  segmentAngle,
  SEGMENTS,
  SWATCH,
  swatchAngle,
} from '../pencilMenu'
import { useStore } from '../store'

const ICONS: Partial<Record<string, ReactNode>> = {
  pen: <Pencil />,
  highlighter: <Highlighter />,
  eraser: <Eraser />,
  select: <MousePointer2 />,
  undo: <Undo2 />,
}

const HALF = MENU_SIZE / 2
const STEP = (Math.PI * 2) / SEGMENTS.length
/** half the gap between neighbouring segments, in px (the same width all the way out) */
const GAP = 3.5

/** A ring segment around angle `a` (0 = up, clockwise), with even gaps to its neighbours. */
function wedge(a: number) {
  const half = STEP / 2
  const o0 = polar(a - half + GAP / RING_OUT, RING_OUT)
  const o1 = polar(a + half - GAP / RING_OUT, RING_OUT)
  const i1 = polar(a + half - GAP / RING_IN, RING_IN)
  const i0 = polar(a - half + GAP / RING_IN, RING_IN)
  return `M${o0.x} ${o0.y} A${RING_OUT} ${RING_OUT} 0 0 1 ${o1.x} ${o1.y} L${i1.x} ${i1.y} A${RING_IN} ${RING_IN} 0 0 0 ${i0.x} ${i0.y} Z`
}

/** The ring of six choices that opens at the Pencil tip, and the arc drawn while the Pencil is held still. */
export function PencilMenu({ palette }: { palette: Palette }) {
  const hold = useStore((s) => s.pencilHold)
  const menu = useStore((s) => s.pencilMenu)
  const tool = useStore((s) => s.tool)
  const style = useStore((s) => s.style)
  const setMenu = useStore((s) => s.setPencilMenu)
  const open = !!menu

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setMenu(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, setMenu])

  const current = tool === 'highlighter' ? style.highlightColor : style.color
  const label = menu ? (labelFor(menu.active) ?? SEGMENTS.find((s) => s.key === tool)?.label ?? '') : ''
  const naming = !!menu?.active

  return (
    <>
      {hold && (
        <svg className="pencil-hold" style={{ left: hold.x, top: hold.y }} viewBox="-22 -22 44 44" aria-hidden>
          <circle r="18" className="pencil-hold-track" />
          <circle r="18" className="pencil-hold-arc" pathLength={1} />
        </svg>
      )}
      {menu && (
        <div
          className="pencil-backdrop"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setMenu(null)
          }}
          data-testid="pencil-menu"
        >
          <div className="pencil-menu" role="menu" aria-label="Pencil menu" style={{ left: menu.x - HALF, top: menu.y - HALF, width: MENU_SIZE, height: MENU_SIZE }}>
            <svg className="pencil-ring" viewBox={`${-HALF} ${-HALF} ${MENU_SIZE} ${MENU_SIZE}`} aria-hidden>
              {SEGMENTS.map((s, i) => {
                const a = segmentAngle(i)
                const on = menu.active === s.key
                // while a colour is being chosen, the colour segment steps back so the colours stand out
                const open = s.key === 'color' && menu.colors && !on
                return (
                  <path
                    key={s.key}
                    d={wedge(a)}
                    className={`pencil-seg ${on ? 'is-active' : ''} ${open ? 'is-open' : ''}`}
                    style={{ animationDelay: `${i * 18}ms` }}
                    onClick={() => choosePencil(s.key)}
                    data-pencil-item={s.key}
                  />
                )
              })}
              <circle className="pencil-hub" r={RING_IN - 3.5} />
            </svg>
            {SEGMENTS.map((s, i) => {
              const at = polar(segmentAngle(i), (RING_IN + RING_OUT) / 2)
              const on = menu.active === s.key
              return (
                <span
                  key={s.key}
                  role="menuitem"
                  aria-label={s.label}
                  className={`pencil-icon ${on ? 'is-active' : ''} ${s.key === tool ? 'is-current' : ''}`}
                  style={{ left: HALF + at.x, top: HALF + at.y, animationDelay: `${40 + i * 18}ms` }}
                >
                  {s.key === 'color' ? (
                    <i className="pencil-hue" style={{ ['--swatch' as string]: palette[current], ['--hues' as string]: COLOR_KEYS.map((c) => palette[c]).join(', ') }} />
                  ) : (
                    ICONS[s.key]
                  )}
                </span>
              )
            })}
            <span className={`pencil-label ${naming ? 'is-naming' : ''}`} style={{ left: HALF, top: HALF }} aria-live="polite">
              {label}
            </span>
            {menu.colors &&
              MENU_COLORS.map((c, i) => {
                const at = polar(swatchAngle(i), COLOR_R)
                const key = `c:${c}`
                return (
                  <button
                    key={c}
                    type="button"
                    role="menuitem"
                    aria-label={COLOR_NAMES[c]}
                    className={`pencil-swatch ${c === current ? 'is-current' : ''} ${menu.active === key ? 'is-active' : ''}`}
                    style={{
                      left: HALF + at.x - SWATCH / 2,
                      top: HALF + at.y - SWATCH / 2,
                      width: SWATCH,
                      height: SWATCH,
                      animationDelay: `${i * 22}ms`,
                      ['--swatch' as string]: palette[c],
                    }}
                    data-pencil-item={key}
                    onClick={() => choosePencil(key)}
                  />
                )
              })}
          </div>
        </div>
      )}
    </>
  )
}
