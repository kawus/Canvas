import { Maximize, Minus, Plus, Redo2, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { IconButton } from './ui'

export function HistoryControls() {
  // while collaborating live, undo/redo cover only your own changes in the shared room
  const canUndo = useStore((s) => (s.collab.status !== 'off' ? s.collab.canUndo : s.past.length > 0))
  const canRedo = useStore((s) => (s.collab.status !== 'off' ? s.collab.canRedo : s.future.length > 0))
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  return (
    <div className="panel cluster">
      <IconButton label="Undo" kbd="⌘Z" disabled={!canUndo} onClick={undo} testId="undo">
        <Undo2 />
      </IconButton>
      <IconButton label="Redo" kbd="⇧⌘Z" disabled={!canRedo} onClick={redo} testId="redo">
        <Redo2 />
      </IconButton>
    </div>
  )
}

export function ZoomControls() {
  const zoom = useStore((s) => s.viewport.zoom)
  const zoomTo = useStore((s) => s.zoomTo)
  const zoomToFit = useStore((s) => s.zoomToFit)
  const step = (dir: 1 | -1) => {
    const stops = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8]
    const next = dir > 0 ? stops.find((s) => s > zoom + 0.001) : [...stops].reverse().find((s) => s < zoom - 0.001)
    zoomTo(next ?? zoom)
  }
  return (
    <div className="panel cluster zoom-cluster">
      <IconButton label="Zoom out" kbd="⌘−" onClick={() => step(-1)}>
        <Minus />
      </IconButton>
      <button type="button" className="zoom-label tip-top" onClick={() => zoomTo(1)} aria-label="Reset zoom to 100%">
        {Math.round(zoom * 100)}%<span className="tip">Reset to 100%</span>
      </button>
      <IconButton label="Zoom in" kbd="⌘+" onClick={() => step(1)}>
        <Plus />
      </IconButton>
      <IconButton label="Zoom to fit" kbd="⇧1" onClick={zoomToFit}>
        <Maximize />
      </IconButton>
    </div>
  )
}

export function EmptyHint() {
  const empty = useStore(
    (s) => s.loaded && !!s.doc.key && s.sync !== 'loading' && s.doc.elements.length === 0 && !s.draft && !s.editingId,
  )
  const penMode = useStore((s) => s.penMode)
  if (!empty) return null
  return (
    <div className="empty-hint" aria-hidden>
      <div className="empty-title">A blank canvas</div>
      <div className="empty-sub">
        {penMode ? 'Draw with your Pencil — tap with it to select. Fingers move around.' : 'Pick a tool below to draw, write or add shapes.'}
        <br />
        Everything saves automatically.
      </div>
    </div>
  )
}

export function Toast() {
  const toast = useStore((s) => s.toast)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!toast) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 2400)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast) return null
  return (
    <div className={`toast ${visible ? 'is-visible' : ''}`} role="status" aria-live="polite" data-testid="toast">
      {toast.message}
    </div>
  )
}
