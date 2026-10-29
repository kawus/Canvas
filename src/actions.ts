import { flushSync } from 'react-dom'
import { FONT_SIZE, LINE_HEIGHT } from './constants'
import { center, geometricBounds, translateEl } from './geometry'
import { toWorld } from './handles'
import { newElementId } from './storage'
import { selectedElements, useStore } from './store'
import type { El, TextEl } from './types'

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

export function finishEditing() {
  const s = S()
  const id = s.editingId
  if (!id) return
  const before = session?.before ?? s.doc.elements
  session = null
  const el = s.doc.elements.find((e) => e.id === id) as TextEl | undefined
  const text = el?.text.replace(/\s+$/, '') ?? ''
  if (!el || !text.trim()) {
    const without = s.doc.elements.filter((e) => e.id !== id)
    const existed = before.some((e) => e.id === id)
    if (existed) s.commit(without, before)
    else s.setElementsLive(without)
    s.setEditing(null)
    if (s.tool === 'text') s.setTool('select')
    return
  }
  const elements = s.doc.elements.map((e) => (e.id === id ? { ...el, text } : e))
  const prev = before.find((e) => e.id === id) as TextEl | undefined
  if (!prev || prev.text !== text) s.commit(elements, before)
  else s.setElementsLive(elements)
  s.setEditing(null)
  s.setTool('select')
  s.select([id])
}

export function updateEditingText(text: string) {
  const s = S()
  const id = s.editingId
  if (!id) return
  s.setElementsLive(s.doc.elements.map((e) => (e.id === id && e.type === 'text' ? { ...e, text } : e)))
}

/* ---------- Selection actions ---------- */

export function cloneWithNewIds(els: El[], dx: number, dy: number) {
  return els.map((e) => ({ ...translateEl(e, dx, dy), id: newElementId() }))
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
