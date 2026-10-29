import { geometricBounds } from '../geometry'
import { getHandles, isSingleLine, selectionFrame, toScreen, FRAME_PAD } from '../handles'
import { selectedElements, useStore } from '../store'
import type { El, Viewport } from '../types'

function elementFrame(el: El, v: Viewport) {
  const b = geometricBounds([el])!
  const [x0, y0] = toScreen(v, b.minX, b.minY)
  const [x1, y1] = toScreen(v, b.maxX, b.maxY)
  return { x: x0 - FRAME_PAD, y: y0 - FRAME_PAD, w: x1 - x0 + FRAME_PAD * 2, h: y1 - y0 + FRAME_PAD * 2 }
}

export function Overlay() {
  const doc = useStore((s) => s.doc)
  const selectedIds = useStore((s) => s.selectedIds)
  const hoveredId = useStore((s) => s.hoveredId)
  const v = useStore((s) => s.viewport)
  const marquee = useStore((s) => s.marquee)
  const penMode = useStore((s) => s.penMode)
  const guides = useStore((s) => s.guides)

  const sel = selectedElements({ doc, selectedIds })
  const hovered = hoveredId ? doc.elements.find((e) => e.id === hoveredId) : null
  const handles = getHandles(sel, v)
  const frame = sel.length && !isSingleLine(sel) ? selectionFrame(sel, v) : null
  const hs = penMode ? 10 : 8 // handle size

  return (
    <svg className="overlay" width="100%" height="100%">
      {hovered && (() => {
        const f = elementFrame(hovered, v)
        return <rect className="ov-hover" x={f.x} y={f.y} width={f.w} height={f.h} rx={4} />
      })()}

      {sel.length > 1 &&
        sel.map((el) => {
          const f = elementFrame(el, v)
          return <rect key={el.id} className="ov-item" x={f.x} y={f.y} width={f.w} height={f.h} rx={3} />
        })}

      {frame && (
        <rect
          className="ov-frame"
          x={frame.minX}
          y={frame.minY}
          width={frame.maxX - frame.minX}
          height={frame.maxY - frame.minY}
          rx={2}
        />
      )}

      {isSingleLine(sel) &&
        (() => {
          const el = sel[0]
          const [ax, ay] = toScreen(v, el.x1, el.y1)
          const [bx, by] = toScreen(v, el.x2, el.y2)
          return <line className="ov-frame" x1={ax} y1={ay} x2={bx} y2={by} />
        })()}

      {handles.map((h) =>
        h.id === 'p1' || h.id === 'p2' ? (
          <circle key={h.id} className="ov-handle" cx={h.x} cy={h.y} r={hs / 2 + 1} />
        ) : (
          <rect
            key={h.id}
            className="ov-handle"
            x={h.x - hs / 2}
            y={h.y - hs / 2}
            width={hs}
            height={hs}
            rx={h.id.length === 1 ? hs / 2 : 2}
          />
        ),
      )}

      {guides.map((g, i) => {
        const [ax, ay] = g.axis === 'x' ? toScreen(v, g.at, g.from) : toScreen(v, g.from, g.at)
        const [bx, by] = g.axis === 'x' ? toScreen(v, g.at, g.to) : toScreen(v, g.to, g.at)
        return <line key={i} className="ov-guide" x1={ax} y1={ay} x2={bx} y2={by} />
      })}

      {marquee &&
        (() => {
          const [x0, y0] = toScreen(v, marquee.minX, marquee.minY)
          const [x1, y1] = toScreen(v, marquee.maxX, marquee.maxY)
          return <rect className="ov-marquee" x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={2} />
        })()}
    </svg>
  )
}
