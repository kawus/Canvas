import { flushSync } from 'react-dom'
import { regroup, unitBounds, units } from './groups'
import { FONT_SIZE, LINE_HEIGHT, STICKY_SIZE } from './constants'
import { center, geometricBounds, translateEl } from './geometry'
import { toWorld } from './handles'
import { newElementId } from './storage'
import { selectedElements, useStore } from './store'
import type { BoxEl, El, StickyEl, TextEl } from './types'

const S = () => useStore.getState()

/* ---------- Text editing ---------- */

interface EditSession {
  id: string
  before: El[]
}

let session: EditSession | null = null
let editorEl: HTMLTextAreaElement | null = null

export function registerEditor(el: HTMLTextAreaElement | null) {
  editorEl = el
}

/** Begin editing a text element. Must run inside the user gesture so iPadOS shows the keyboard. */
export function startEditing(id: string, before?: El[]) {
  const s = S()
  session = { id, before: before ?? s.doc.elements }
  flushSync(() => {
    s.select([])
    s.setEditing(id)
  })
  if (editorEl) {
    editorEl.focus({ preventScroll: true })
    const len = editorEl.value.length
    editorEl.setSelectionRange(len, len)
  }
}

export function createTextAt(x: number, y: number) {
  const s = S()
  const fontSize = FONT_SIZE[s.style.fontSize]
  const el: TextEl = {
    id: newElementId(),
    type: 'text',
    color: s.style.color,
    x,
    y: y - (fontSize * LINE_HEIGHT) / 2,
    text: '',
    fontSize,
  }
  const before = s.doc.elements
  s.setElementsLive([...before, el])
  startEditing(el.id, before)
}

export function createStickyAt(x: number, y: number) {
  const s = S()
  const el: StickyEl = {
    id: newElementId(),
    type: 'sticky',
    color: s.style.stickyColor,
    x: x - STICKY_SIZE / 2,
    y: y - STICKY_SIZE / 2,
    w: STICKY_SIZE,
    h: STICKY_SIZE,
    text: '',
    fontSize: FONT_SIZE[s.style.fontSize],
  }
  const before = s.doc.elements
  s.setElementsLive([...before, el])
  startEditing(el.id, before)
}

/** Elements whose text is edited in place: free text, stickies and shape labels. */
export function isEditable(el: El | null | undefined): el is TextEl | StickyEl | BoxEl {
  return !!el && (el.type === 'text' || el.type === 'sticky' || el.type === 'rect' || el.type === 'ellipse')
}

export function finishEditing() {
  const s = S()
  const id = s.editingId
  if (!id) return
  const before = session?.before ?? s.doc.elements
  session = null
  const el = s.doc.elements.find((e) => e.id === id)
  const prev = before.find((e) => e.id === id)
  if (!isEditable(el)) {
    s.setEditing(null)
    return
  }
  const text = (el.text ?? '').replace(/\s+$/, '')

  // Free text disappears when emptied; stickies and shapes stay.
  if (el.type === 'text' && !text.trim()) {
    const without = s.doc.elements.filter((e) => e.id !== id)
    if (prev) s.commit(without, before)
    else s.setElementsLive(without)
    s.setEditing(null)
    if (s.tool === 'text') s.setTool('select')
    return
  }

  const updated = { ...el, text } as El
  if (el.type !== 'text' && !text) delete (updated as BoxEl).text
  const elements = s.doc.elements.map((e) => (e.id === id ? updated : e))
  const prevText = prev && isEditable(prev) ? (prev.text ?? '') : null
  if (prevText === null || prevText !== text) s.commit(elements, before)
  else s.setElementsLive(elements)
  s.setEditing(null)
  s.setTool('select')
  s.select([id])
}

export function updateEditingText(text: string) {
  const s = S()
  const id = s.editingId
  if (!id) return
  s.setElementsLive(s.doc.elements.map((e) => (e.id === id && isEditable(e) ? ({ ...e, text } as El) : e)))
}

/* ---------- Selection actions ---------- */

export function cloneWithNewIds(els: El[], dx: number, dy: number): El[] {
  const ids = new Map(els.map((e) => [e.id, newElementId()]))
  return regroup(els).map((e) => {
    const c = { ...translateEl(e, dx, dy), id: ids.get(e.id)! }
    if (c.type === 'arrow' || c.type === 'line') {
      // keep connections inside the copied group, drop ones that point outside it
      if (c.start) c.start = ids.get(c.start)
      if (c.end) c.end = ids.get(c.end)
      if (!c.start) delete c.start
      if (!c.end) delete c.end
    }
    return c
  })
}

export function duplicateSelection() {
  const s = S()
  const sel = selectedElements(s)
  if (!sel.length) return
  const clones = cloneWithNewIds(sel, 16, 16)
  s.commit([...s.doc.elements, ...clones])
  s.select(clones.map((c) => c.id))
}

export function selectAll() {
  const s = S()
  if (s.tool !== 'select') s.setTool('select')
  s.select(s.doc.elements.map((e) => e.id))
}

export function nudge(dx: number, dy: number) {
  const s = S()
  if (!s.selectedIds.length) return
  const ids = new Set(s.selectedIds)
  s.commit(s.doc.elements.map((e) => (ids.has(e.id) ? translateEl(e, dx, dy) : e)))
}

export function bringToFront() {
  const s = S()
  const ids = new Set(s.selectedIds)
  if (!ids.size) return
  const els = s.doc.elements
  s.commit([...els.filter((e) => !ids.has(e.id)), ...els.filter((e) => ids.has(e.id))])
}

export function sendToBack() {
  const s = S()
  const ids = new Set(s.selectedIds)
  if (!ids.size) return
  const els = s.doc.elements
  s.commit([...els.filter((e) => ids.has(e.id)), ...els.filter((e) => !ids.has(e.id))])
}

/* ---------- Align & distribute ---------- */

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

/** Selected items that can be aligned. Connected arrows follow their shapes instead. */
export function alignable(els: El[]) {
  return els.filter((e) => !((e.type === 'arrow' || e.type === 'line') && (e.start || e.end)))
}

export function alignSelection(mode: AlignMode) {
  const s = S()
  // a group moves as one piece
  const items = units(alignable(selectedElements(s)))
  if (items.length < 2) return
  const all = geometricBounds(items.flat())!
  const moves = new Map<string, [number, number]>()
  for (const unit of items) {
    const b = unitBounds(unit)
    let dx = 0
    let dy = 0
    if (mode === 'left') dx = all.minX - b.minX
    if (mode === 'right') dx = all.maxX - b.maxX
    if (mode === 'hcenter') dx = (all.minX + all.maxX) / 2 - (b.minX + b.maxX) / 2
    if (mode === 'top') dy = all.minY - b.minY
    if (mode === 'bottom') dy = all.maxY - b.maxY
    if (mode === 'vcenter') dy = (all.minY + all.maxY) / 2 - (b.minY + b.maxY) / 2
    if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) for (const el of unit) moves.set(el.id, [dx, dy])
  }
  if (!moves.size) return
  s.commit(s.doc.elements.map((e) => (moves.has(e.id) ? translateEl(e, ...moves.get(e.id)!) : e)))
}

/** Even gaps between items, keeping the first and last in place. */
export function distributeSelection(axis: 'x' | 'y') {
  const s = S()
  const items = units(alignable(selectedElements(s)))
  if (items.length < 3) return
  const boxes = items.map((unit) => ({ unit, b: unitBounds(unit) }))
  const lo = (b: (typeof boxes)[0]['b']) => (axis === 'x' ? b.minX : b.minY)
  const hi = (b: (typeof boxes)[0]['b']) => (axis === 'x' ? b.maxX : b.maxY)
  boxes.sort((a, b) => lo(a.b) + hi(a.b) - (lo(b.b) + hi(b.b)))
  const start = lo(boxes[0].b)
  const end = Math.max(...boxes.map((x) => hi(x.b)))
  const sizes = boxes.reduce((sum, x) => sum + hi(x.b) - lo(x.b), 0)
  const gap = (end - start - sizes) / (boxes.length - 1)
  const moves = new Map<string, number>()
  let cursor = start
  for (const { unit, b } of boxes) {
    const d = cursor - lo(b)
    if (Math.abs(d) > 0.001) for (const el of unit) moves.set(el.id, d)
    cursor += hi(b) - lo(b) + gap
  }
  if (!moves.size) return
  s.commit(
    s.doc.elements.map((e) => {
      const d = moves.get(e.id)
      if (d === undefined) return e
      return axis === 'x' ? translateEl(e, d, 0) : translateEl(e, 0, d)
    }),
  )
}

/* ---------- Clipboard ---------- */

const CLIP_MARK = 'canvas-board/elements'
let pasteCount = 0

export function copySelection(e?: ClipboardEvent) {
  const s = S()
  const sel = selectedElements(s)
  if (!sel.length) return false
  const payload = JSON.stringify({ type: CLIP_MARK, elements: sel })
  pasteCount = 0
  if (e?.clipboardData) {
    e.clipboardData.setData('text/plain', payload)
    e.preventDefault()
  } else {
    navigator.clipboard?.writeText(payload).catch(() => {})
  }
  return true
}

export function pasteText(text: string) {
  const s = S()
  let els: El[] | null = null
  try {
    const parsed = JSON.parse(text)
    if (parsed?.type === CLIP_MARK && Array.isArray(parsed.elements)) els = parsed.elements
  } catch {
    /* plain text */
  }
  if (els && els.length) {
    pasteCount++
    const b = geometricBounds(els)!
    const v = s.viewport
    // Paste in place, offset a little each time; if that's off-screen, paste at the viewport center.
    let dx = pasteCount * 16
    let dy = pasteCount * 16
    const [vx0, vy0] = toWorld(v, 0, 0)
    const [vx1, vy1] = toWorld(v, window.innerWidth, window.innerHeight)
    const visible = b.maxX + dx > vx0 && b.minX + dx < vx1 && b.maxY + dy > vy0 && b.minY + dy < vy1
    if (!visible) {
      const [cx, cy] = center(b)
      dx = (vx0 + vx1) / 2 - cx
      dy = (vy0 + vy1) / 2 - cy
    }
    const clones = cloneWithNewIds(els, dx, dy)
    s.setTool('select')
    s.commit([...s.doc.elements, ...clones])
    s.select(clones.map((c) => c.id))
    return
  }
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return
  const v = s.viewport
  const [cx, cy] = toWorld(v, window.innerWidth / 2, window.innerHeight / 2)
  const el: TextEl = {
    id: newElementId(),
    type: 'text',
    color: s.style.color,
    x: cx,
    y: cy,
    text: clean.slice(0, 5000),
    fontSize: FONT_SIZE[s.style.fontSize],
  }
  s.setTool('select')
  s.commit([...s.doc.elements, el])
  s.select([el.id])
}
