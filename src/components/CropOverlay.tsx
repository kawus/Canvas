import { RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAsset } from '../assets'
import { applyCrop, FULL, originalBox, type Rect } from '../crop'
import { toScreen } from '../handles'
import { useStore } from '../store'
import type { ImageEl } from '../types'

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type Drag = { kind: 'move' | Handle; x: number; y: number; start: Rect }

const CURSOR: Record<Handle, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Cropping an image: the whole original, the part outside the crop dimmed, brackets to drag. */
export function CropOverlay() {
  const cropId = useStore((s) => s.cropId)
  const el = useStore((s) => s.doc.elements.find((e) => e.id === s.cropId && e.type === 'image') as ImageEl | undefined)
  useEffect(() => {
    // the image was deleted (e.g. by someone else) while cropping
    if (cropId && !el) useStore.getState().setCropId(null)
  }, [cropId, el])
  if (!cropId || !el) return null
  return <Cropper key={el.id} el={el} />
}

function Cropper({ el }: { el: ImageEl }) {
  const v = useStore((s) => s.viewport)
  const setCropId = useStore((s) => s.setCropId)
  const url = useAsset(el.src ?? el.asset)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [r, setR] = useState<Rect>(el.crop ?? FULL)
  const [busy, setBusy] = useState(false)
  const drag = useRef<Drag | null>(null)
  const coarse = window.matchMedia('(pointer: coarse)').matches

  useEffect(() => {
    if (!url) return
    const img = new Image()
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = url
  }, [url])

  const close = () => setCropId(null)
  const done = async () => {
    if (!size || !url || busy) return close()
    setBusy(true)
    try {
      await applyCrop(el.id, r, url, size.w, size.h)
    } finally {
      close()
    }
  }

  // Enter = done, Esc = cancel; nothing else reaches the canvas shortcuts
  const doneRef = useRef(done)
  useEffect(() => {
    doneRef.current = done
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Escape') setCropId(null)
      else if (e.key === 'Enter') {
        e.preventDefault()
        void doneRef.current()
      } else if (!e.metaKey && !e.ctrlKey) e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [setCropId])

  // scroll / pinch still move around the board while cropping
  const onWheel = (e: React.WheelEvent) => {
    const s = useStore.getState()
    if (e.ctrlKey || e.metaKey) {
      const zoom = clamp(s.viewport.zoom * Math.exp(-e.deltaY * 0.01), 0.1, 8)
      const k = zoom / s.viewport.zoom
      s.setViewport({ zoom, x: e.clientX - (e.clientX - s.viewport.x) * k, y: e.clientY - (e.clientY - s.viewport.y) * k })
    } else s.setViewport({ ...s.viewport, x: s.viewport.x - e.deltaX, y: s.viewport.y - e.deltaY })
  }

  if (!size) {
    return (
      <div className="crop-layer" onPointerDown={close}>
        <div className="crop-bar panel">Loading image…</div>
      </div>
    )
  }

  const box = originalBox(el, size.w, size.h)
  const [fx, fy] = toScreen(v, box.x, box.y)
  const fw = box.w * v.zoom
  const fh = box.h * v.zoom
  const cx = fx + r[0] * fw
  const cy = fy + r[1] * fh
  const cw = r[2] * fw
  const ch = r[3] * fh
  const minX = Math.min(1, 24 / fw)
  const minY = Math.min(1, 24 / fh)

  const onDown = (e: React.PointerEvent, kind: Drag['kind'] | null) => {
    e.stopPropagation()
    if (!kind) {
      // outside the picture: finish
      void done()
      return
    }
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    drag.current = { kind, x: e.clientX, y: e.clientY, start: r }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x) / fw
    const dy = (e.clientY - d.y) / fh
    let [x, y, w, h] = d.start
    if (d.kind === 'move') {
      x = clamp(x + dx, 0, 1 - w)
      y = clamp(y + dy, 0, 1 - h)
    } else {
      if (d.kind.includes('w')) {
        const right = x + w
        x = clamp(x + dx, 0, right - minX)
        w = right - x
      }
      if (d.kind.includes('e')) w = clamp(w + dx, minX, 1 - x)
      if (d.kind.includes('n')) {
        const bottom = y + h
        y = clamp(y + dy, 0, bottom - minY)
        h = bottom - y
      }
      if (d.kind.includes('s')) h = clamp(h + dy, minY, 1 - y)
    }
    setR([x, y, w, h])
  }
  const onUp = () => (drag.current = null)

  // grab areas: generous on touch screens
  const grab = coarse ? 22 : 12
  const L = Math.min(22, cw / 3, ch / 3) // bracket length
  const handles: { id: Handle; x: number; y: number; w: number; h: number }[] = [
    { id: 'nw', x: cx - grab, y: cy - grab, w: grab * 2, h: grab * 2 },
    { id: 'ne', x: cx + cw - grab, y: cy - grab, w: grab * 2, h: grab * 2 },
    { id: 'sw', x: cx - grab, y: cy + ch - grab, w: grab * 2, h: grab * 2 },
    { id: 'se', x: cx + cw - grab, y: cy + ch - grab, w: grab * 2, h: grab * 2 },
    { id: 'n', x: cx + grab, y: cy - grab, w: Math.max(0, cw - grab * 2), h: grab * 2 },
    { id: 's', x: cx + grab, y: cy + ch - grab, w: Math.max(0, cw - grab * 2), h: grab * 2 },
    { id: 'w', x: cx - grab, y: cy + grab, w: grab * 2, h: Math.max(0, ch - grab * 2) },
    { id: 'e', x: cx + cw - grab, y: cy + grab, w: grab * 2, h: Math.max(0, ch - grab * 2) },
  ]
  const brackets = [
    `M${cx} ${cy + L}V${cy}H${cx + L}`,
    `M${cx + cw - L} ${cy}H${cx + cw}V${cy + L}`,
    `M${cx} ${cy + ch - L}V${cy + ch}H${cx + L}`,
    `M${cx + cw - L} ${cy + ch}H${cx + cw}V${cy + ch - L}`,
    // short bars in the middle of each side
    `M${cx + cw / 2 - L / 2} ${cy}h${L}`,
    `M${cx + cw / 2 - L / 2} ${cy + ch}h${L}`,
    `M${cx} ${cy + ch / 2 - L / 2}v${L}`,
    `M${cx + cw} ${cy + ch / 2 - L / 2}v${L}`,
  ].join('')
  const isFull = r.every((n, i) => Math.abs(n - FULL[i]) < 0.0005)

  return (
    <div className="crop-layer" onPointerDown={(e) => onDown(e, null)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} data-testid="crop">
      <svg className="crop-svg" width="100%" height="100%">
        <image href={url} x={fx} y={fy} width={fw} height={fh} preserveAspectRatio="none" />
        {/* dim everything outside the crop */}
        <path className="crop-dim" fillRule="evenodd" d={`M${fx} ${fy}h${fw}v${fh}h${-fw}Z M${cx} ${cy}h${cw}v${ch}h${-cw}Z`} />
        <rect className="crop-frame" x={cx} y={cy} width={cw} height={ch} />
        <path
          className="crop-thirds"
          d={`M${cx + cw / 3} ${cy}v${ch}M${cx + (2 * cw) / 3} ${cy}v${ch}M${cx} ${cy + ch / 3}h${cw}M${cx} ${cy + (2 * ch) / 3}h${cw}`}
        />
        <path className="crop-brackets" d={brackets} />
        <rect x={fx} y={fy} width={fw} height={fh} fill="transparent" style={{ cursor: 'move' }} onPointerDown={(e) => onDown(e, 'move')} data-testid="crop-move" />
        {handles.map((h) => (
          <rect
            key={h.id}
            x={h.x}
            y={h.y}
            width={h.w}
            height={h.h}
            fill="transparent"
            style={{ cursor: CURSOR[h.id] }}
            onPointerDown={(e) => onDown(e, h.id)}
            data-testid={`crop-${h.id}`}
          />
        ))}
      </svg>
      <div className="crop-bar panel" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="ghost-btn crop-reset" disabled={isFull} onClick={() => setR(FULL)} data-testid="crop-reset">
          <RotateCcw /> <span>Reset</span>
        </button>
        <span className="sep" />
        <button type="button" className="ghost-btn" onClick={close} data-testid="crop-cancel">
          Cancel
        </button>
        <button type="button" className="primary-btn" onClick={() => void done()} disabled={busy} data-testid="crop-done">
          <span>{busy ? 'Cropping…' : 'Done'}</span>
        </button>
      </div>
    </div>
  )
}
