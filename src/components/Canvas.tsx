import { play } from '../sound'
import { createElement, memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAsset } from '../assets'
import { CanvasController } from '../controller'
import { getBounds } from '../geometry'
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

const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const ElementView = memo(function ElementView({
  el,
  palette,
  faded,
  editing,
  land,
  lift,
  glide,
  exit,
}: {
  el: El
  palette: Palette
  faded: boolean
  /** while its text is being edited, the text itself is drawn by the editor */
  editing: boolean
  /** how it moves (on the board only; thumbnails and exports stay still): just added */
  land?: boolean
  /** being dragged: lifts a little */
  lift?: boolean
  /** moved by a commit (tidy, align, undo): eases from where it was */
  glide?: boolean
  /** just removed: fades away */
  exit?: boolean
}) {
  const ref = useRef<SVGGElement>(null)
  const before = useRef<ReturnType<typeof getBounds> | null>(null)
  // glide: when a commit moves or resizes it, ease from where it was to where it is now
  useLayoutEffect(() => {
    const now = getBounds(el)
    const was = before.current
    before.current = now
    const g = ref.current
    if (!g || !was || !glide || still) return
    const w = now.maxX - now.minX
    const h = now.maxY - now.minY
    const sx = w > 0.5 ? (was.maxX - was.minX) / w : 1
    const sy = h > 0.5 ? (was.maxY - was.minY) / h : 1
    const ox = was.minX - sx * now.minX
    const oy = was.minY - sy * now.minY
    if (Math.abs(ox) < 0.3 && Math.abs(oy) < 0.3 && Math.abs(sx - 1) < 0.002 && Math.abs(sy - 1) < 0.002) return
    g.animate([{ transform: `translate(${ox}px, ${oy}px) scale(${sx}, ${sy})` }, { transform: 'none' }], {
      duration: 260,
      easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
    })
  }, [el, glide])

  const cls = `el ${land ? 'el-land' : ''} ${lift ? 'el-lift' : ''} ${exit ? 'el-exit' : ''}`
  const hash = el.type === 'image' ? el.asset : el.type === 'link' ? el.image : undefined
  if (hash) {
    return (
      <g ref={ref} className={cls} opacity={faded ? 0.25 : 1}>
        <ImageView el={el} palette={palette} hash={hash} />
      </g>
    )
  }
  let prims = elementPrims(el, palette)
  if (editing) prims = el.type === 'text' ? [] : prims.filter((p) => p.tag !== 'text')
  return (
    <g ref={ref} className={cls} opacity={faded ? 0.25 : 1}>
      {prims.map((p, i) => (
        <PrimView key={i} p={p} />
      ))}
    </g>
  )
})

/** Things that arrive by being drawn (strokes, lines, drawn shapes) don't need to land. */
const LANDS = new Set(['sticky', 'image', 'link', 'swatch', 'text'])

export function Canvas({ palette }: { palette: Palette }) {
  const ref = useRef<HTMLDivElement>(null)
  const elements = useStore((s) => s.doc.elements)
  const draft = useStore((s) => s.draft)
  const viewport = useStore((s) => s.viewport)
  const erasing = useStore((s) => s.erasing)
  const editingId = useStore((s) => s.editingId)
  const peers = useStore((s) => s.collab.peers)
  const change = useStore((s) => s.change)
  const lifted = useStore((s) => s.lifted)
  const boardId = useStore((s) => s.doc.id)

  // which items just arrived (they land) and which just left (they fade away)
  const known = useRef<{ board: string; ids: Set<string>; byId: Map<string, El> } | null>(null)
  const [ghosts, setGhosts] = useState<El[]>([])
  const [seen, setSeen] = useState({ board: boardId, elements, fresh: new Set<string>() })
  let fresh = seen.fresh
  if (seen.elements !== elements || seen.board !== boardId) {
    fresh = new Set<string>()
    if (seen.board === boardId && change !== 'load') {
      const before = new Set(seen.elements.map((e) => e.id))
      for (const el of elements) if (!before.has(el.id) && LANDS.has(el.type) && el.id !== draft?.id) fresh.add(el.id)
    }
    setSeen({ board: boardId, elements, fresh })
  }
  useLayoutEffect(() => {
    const prev = known.current
    const byId = new Map(elements.map((e) => [e.id, e]))
    known.current = { board: boardId, ids: new Set(byId.keys()), byId }
    if (!prev || prev.board !== boardId || change === 'load') return
    // your own changes make a soft sound (not other people's): new notes arrive live, while you start typing
    const added = (change === 'commit' || change === 'live') && elements.some((e) => !prev.ids.has(e.id) && LANDS.has(e.type))
    if (change === 'live') {
      if (added) play('place')
      return
    }
    const gone = [...prev.byId.values()].filter((e) => !byId.has(e.id))
    // an empty text that was never written in goes quietly
    if (change === 'commit' && gone.some((e) => !(e.type === 'text' && !e.text.trim()))) play('remove')
    else if (added) play('place')
    if (!gone.length) return
    setGhosts((g) => [...g, ...gone])
    const ids = new Set(gone.map((e) => e.id))
    setTimeout(() => setGhosts((g) => g.filter((e) => !ids.has(e.id))), 220)
  }, [elements, boardId, change])
  const glide = change === 'commit' || change === 'remote'
  const liftedSet = new Set(lifted)

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
              land={fresh.has(el.id)}
              lift={liftedSet.has(el.id)}
              glide={glide}
            />
          ))}
          {ghosts.map((el) => (
            <ElementView key={`gone-${el.id}`} el={el} palette={palette} faded={false} editing={false} exit />
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
