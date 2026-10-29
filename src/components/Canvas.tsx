import { createElement, memo, useEffect, useRef } from 'react'
import { useAsset } from '../assets'
import { CanvasController } from '../controller'
import { toWorld } from '../handles'
import { importImages } from '../images'
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

function ImageView({ el, palette }: { el: Extract<El, { type: 'image' }>; palette: Palette }) {
  const url = useAsset(el.asset)
  return (
    <>
      {elementPrims(el, palette, () => url).map((p, i) => (
        <PrimView key={i} p={p} />
      ))}
    </>
  )
}

const ElementView = memo(function ElementView({
  el,
  palette,
  faded,
  editing,
}: {
  el: El
  palette: Palette
  faded: boolean
  /** while its text is being edited, the text itself is drawn by the editor */
  editing: boolean
}) {
  if (el.type === 'image') {
    return (
      <g opacity={faded ? 0.25 : 1}>
        <ImageView el={el} palette={palette} />
      </g>
    )
  }
  let prims = elementPrims(el, palette)
  if (editing) prims = el.type === 'text' ? [] : prims.filter((p) => p.tag !== 'text')
  return (
    <g opacity={faded ? 0.25 : 1}>
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
  const peers = useStore((s) => s.collab.peers)

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
    <div
      ref={ref}
      className="canvas"
      data-testid="canvas"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      }}
      onDrop={(e) => {
        const files = [...e.dataTransfer.files]
        if (!files.length) return
        e.preventDefault()
        const r = e.currentTarget.getBoundingClientRect()
        void importImages(files, toWorld(viewport, e.clientX - r.left, e.clientY - r.top))
      }}
    >
      <svg className="canvas-svg" width="100%" height="100%">
        <defs>
          {/* the dot is drawn 1px into its tile, so shift the tile to centre dots on grid points */}
          <pattern id="dots" width={gap} height={gap} patternUnits="userSpaceOnUse" x={ox - 1} y={oy - 1}>
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
              editing={el.id === editingId}
            />
          ))}
          {peers.map(
            (p) => p.draft && <ElementView key={`peer-${p.id}`} el={p.draft} palette={palette} faded={false} editing={false} />,
          )}
          {draft && <ElementView el={draft} palette={palette} faded={false} editing={false} />}
        </g>
      </svg>
      <Overlay />
    </div>
  )
}
