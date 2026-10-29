import { createElement, memo, useEffect, useRef } from 'react'
import { CanvasController } from '../controller'
import { elementPrims, type Prim } from '../render'
import { useStore } from '../store'
import type { El } from '../types'
import type { Palette } from '../constants'
import { Overlay } from './Overlay'

function PrimView({ p }: { p: Prim }) {
  if (p.tag === 'text') {
    return (
      <text {...p.attrs} style={{ whiteSpace: 'pre' }}>
        {p.lines.map((l, i) => (
          <tspan key={i} x={l.x} y={l.y}>
            {l.text || ' '}
          </tspan>
        ))}
      </text>
    )
  }
  return createElement(p.tag, p.attrs)
}

const ElementView = memo(function ElementView({
  el,
  palette,
  faded,
  hidden,
}: {
  el: El
  palette: Palette
  faded: boolean
  hidden: boolean
}) {
  const prims = elementPrims(el, palette)
  return (
    <g opacity={hidden ? 0 : faded ? 0.25 : 1}>
      {prims.map((p, i) => (
        <PrimView key={i} p={p} />
      ))}
    </g>
  )
})

export function Canvas({ palette }: { palette: Palette }) {
  const ref = useRef<HTMLDivElement>(null)
  const elements = useStore((s) => s.doc.elements)
  const draft = useStore((s) => s.draft)
  const viewport = useStore((s) => s.viewport)
  const erasing = useStore((s) => s.erasing)
  const editingId = useStore((s) => s.editingId)

  useEffect(() => {
    const c = new CanvasController(ref.current!)
    return () => c.destroy()
  }, [])

  const erasingSet = new Set(erasing)
  // Dot grid that follows pan & zoom, thinning out when zoomed far away
  let gap = 24 * viewport.zoom
  while (gap < 12) gap *= 2
  const ox = ((viewport.x % gap) + gap) % gap
  const oy = ((viewport.y % gap) + gap) % gap

  return (
    <div ref={ref} className="canvas" data-testid="canvas">
      <svg className="canvas-svg" width="100%" height="100%">
        <defs>
          <pattern id="dots" width={gap} height={gap} patternUnits="userSpaceOnUse" x={ox} y={oy}>
            <circle cx={1} cy={1} r={1} className="dot" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
          {elements.map((el) => (
            <ElementView
              key={el.id}
              el={el}
              palette={palette}
              faded={erasingSet.has(el.id)}
              hidden={el.id === editingId}
            />
          ))}
          {draft && <ElementView el={draft} palette={palette} faded={false} hidden={false} />}
        </g>
      </svg>
      <Overlay />
    </div>
  )
}
