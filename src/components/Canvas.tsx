import { createElement, memo, useEffect, useRef } from 'react'
import { useAsset } from '../assets'
import { CanvasController } from '../controller'
import { toWorld } from '../handles'
import { importImages } from '../images'
import { addLink, importImageUrl, isUrl } from '../moodboard'
import { elementPrims, type Prim } from '../render'
import { dotSpacing } from '../snap'
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

/** Elements that show a stored image: pictures and link cards with a preview. */
function ImageView({ el, palette, hash }: { el: El; palette: Palette; hash: string }) {
  const url = useAsset(hash)
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
  const hash = el.type === 'image' ? el.asset : el.type === 'link' ? el.image : undefined
  if (hash) {
    return (
      <g opacity={faded ? 0.25 : 1}>
        <ImageView el={el} palette={palette} hash={hash} />
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
  // Dot grid that follows pan & zoom: 8 / 16 / 24 … apart, closer when zoomed in, thinning out far away
  const gap = dotSpacing(viewport.zoom) * viewport.zoom
  const ox = ((viewport.x % gap) + gap) % gap
  const oy = ((viewport.y % gap) + gap) % gap

  return (
    <div
      ref={ref}
      className="canvas"
      data-testid="canvas"
      onDragOver={(e) => {
        const t = e.dataTransfer.types
        if (t.includes('Files') || t.includes('text/uri-list') || t.includes('text/html')) e.preventDefault()
      }}
      onDrop={(e) => {
        if (!useStore.getState().doc.key) return
        const r = e.currentTarget.getBoundingClientRect()
        const at = toWorld(viewport, e.clientX - r.left, e.clientY - r.top)
        const files = [...e.dataTransfer.files]
        if (files.length) {
          e.preventDefault()
          void importImages(files, at)
          return
        }
        // dragged from a web page: an image, or a link
        const html = e.dataTransfer.getData('text/html')
        const src = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, '&')
        const uri = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')).split('\n')[0].trim()
        if (src && /^https?:/i.test(src)) {
          e.preventDefault()
          void importImageUrl(src, at)
        } else if (isUrl(uri)) {
          e.preventDefault()
          void addLink(uri, at)
        }
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
