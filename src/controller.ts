import { cloneWithNewIds, createTextAt, finishEditing, startEditing } from './actions'
import { MAX_ZOOM, MIN_ZOOM } from './constants'
import { geometricBounds, hitTest, hitTopmost, normalizeBox, pointInBox, scaleEl, translateEl } from './geometry'
import { HANDLE_DIR, getHandles, hitHandle, selectionFrame, toWorld, type HandleId } from './handles'
import { newElementId } from './storage'
import { selectedElements, useStore } from './store'
import type { Box, El, FreedrawEl, LineEl, Point, StrokePoint, Tool, Viewport } from './types'

type Action =
  | { kind: 'pan'; pointerId: number; sx: number; sy: number; vp: Viewport; touch: boolean; moved: boolean }
  | { kind: 'draw'; pointerId: number; el: FreedrawEl }
  | { kind: 'shape'; pointerId: number; type: 'rect' | 'ellipse' | 'line' | 'arrow'; start: Point; sx: number; sy: number }
  | { kind: 'marquee'; pointerId: number; start: Point; base: string[] }
  | {
      kind: 'move'
      pointerId: number
      sx: number
      sy: number
      start: Point
      before: El[]
      base: El[]
      ids: Set<string>
      moved: boolean
      clickedId: string | null
      wasSelected: boolean
      alt: boolean
    }
  | {
      kind: 'resize'
      pointerId: number
      handle: HandleId
      sx: number
      sy: number
      box: Box
      before: El[]
      ids: Set<string>
      lockText: boolean
    }
  | { kind: 'endpoint'; pointerId: number; which: 1 | 2; id: string; before: El[]; sx: number; sy: number; orig: LineEl }
  | { kind: 'erase'; pointerId: number; last: Point; hits: Set<string> }

interface PointerInfo {
  x: number
  y: number
  type: string
}

const S = () => useStore.getState()
const DRAG_THRESHOLD = 3
const DRAWING_TOOLS: Tool[] = ['pen', 'eraser', 'rect', 'ellipse', 'arrow', 'line', 'text']

export function toolCursor(tool: Tool) {
  switch (tool) {
    case 'hand':
      return 'grab'
    case 'select':
      return 'default'
    case 'text':
      return 'text'
    case 'eraser':
      return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Ccircle cx='10' cy='10' r='7' fill='white' fill-opacity='.6' stroke='%23666' stroke-width='1.5'/%3E%3C/svg%3E") 10 10, crosshair`
    default:
      return 'crosshair'
  }
}

export class CanvasController {
  private el: HTMLElement
  private pointers = new Map<number, PointerInfo>()
  private action: Action | null = null
  private pinch: { ids: [number, number]; dist: number; cx: number; cy: number; vp: Viewport } | null = null
  private lastDown: { t: number; x: number; y: number } | null = null
  private space = false
  private gestureZoom = 1
  private cleanup: (() => void)[] = []

  constructor(el: HTMLElement) {
    this.el = el
    const on = <K extends keyof WindowEventMap>(
      target: Window | HTMLElement,
      type: K,
      fn: (e: WindowEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn as EventListener, opts)
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener, opts))
    }
    on(el, 'pointerdown', (e) => this.onDown(e))
    on(window, 'pointermove', (e) => this.onMove(e))
    on(window, 'pointerup', (e) => this.onUp(e))
    on(window, 'pointercancel', (e) => this.onUp(e, true))
    on(el, 'wheel', (e) => this.onWheel(e), { passive: false })
    on(el, 'contextmenu', (e) => e.preventDefault())
    // Safari (macOS trackpad pinch, iPadOS) fires proprietary gesture events.
    on(window, 'gesturestart' as keyof WindowEventMap, (e) => this.onGesture(e as Event, 'start'), { passive: false })
    on(window, 'gesturechange' as keyof WindowEventMap, (e) => this.onGesture(e as Event, 'change'), { passive: false })
    on(window, 'gestureend' as keyof WindowEventMap, (e) => e.preventDefault(), { passive: false })
    on(window, 'keydown', (e) => {
      if (e.code === 'Space' && !isTyping(e)) {
        if (!this.space) {
          this.space = true
          this.updateCursor()
        }
        e.preventDefault()
      }
    })
    on(window, 'keyup', (e) => {
      if (e.code === 'Space') {
        this.space = false
        this.updateCursor()
      }
    })
    on(window, 'blur', () => {
      this.space = false
      this.cancel()
      this.pointers.clear()
    })
    this.cleanup.push(useStore.subscribe((s, p) => s.tool !== p.tool && this.updateCursor()))
    this.updateCursor()
  }

  destroy() {
    this.cleanup.forEach((f) => f())
  }

  /* ---------- helpers ---------- */

  private local(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.el.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  private world(sx: number, sy: number): Point {
    return toWorld(S().viewport, sx, sy)
  }

  private tolerance(type: string) {
    return (type === 'touch' ? 14 : type === 'pen' ? 8 : 6) / S().viewport.zoom
  }

  private updateCursor(override?: string) {
    if (override) {
      this.el.style.cursor = override
      return
    }
    if (this.action?.kind === 'pan') this.el.style.cursor = 'grabbing'
    else if (this.space) this.el.style.cursor = 'grab'
    else this.el.style.cursor = toolCursor(S().tool)
  }

  private touchCount() {
    let n = 0
    for (const p of this.pointers.values()) if (p.type === 'touch') n++
    return n
  }

  private penDown() {
    for (const p of this.pointers.values()) if (p.type === 'pen') return true
    return false
  }

  /** Abort the current gesture and restore the board to how it was before it began. */
  cancel() {
    const a = this.action
    if (!a) return
    const s = S()
    if (a.kind === 'move' || a.kind === 'resize' || a.kind === 'endpoint') s.setElementsLive(a.before)
    if (a.kind === 'draw' || a.kind === 'shape') s.setDraft(null)
    if (a.kind === 'marquee') {
      s.setMarquee(null)
      s.select(a.base)
    }
    if (a.kind === 'erase') s.setErasing([])
    this.action = null
    this.updateCursor()
  }

  /* ---------- pointer down ---------- */

  private onDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return
    e.preventDefault()
    const s = S()
    const [sx, sy] = this.local(e)
    this.pointers.set(e.pointerId, { x: sx, y: sy, type: e.pointerType })

    if (s.editingId) {
      finishEditing()
      return
    }
    // pointerdown is prevented (to stop text selection / callouts), so blur inputs like the title manually
    const active = document.activeElement as HTMLElement | null
    if (active && active !== document.body) active.blur()

    if (e.pointerType === 'pen') s.setPenMode(true)

    if (e.pointerType === 'touch') {
      if (this.penDown()) return // palm resting while the pencil is down
      if (this.touchCount() >= 2) {
        this.cancel()
        this.startPinch()
        return
      }
    } else if (this.action && this.action.pointerId !== e.pointerId) {
      // a pen or mouse takes over from any finger gesture in progress
      this.cancel()
      this.pinch = null
    }
    if (this.action) return

    // double-tap / double-click detection (works for touch and pencil too)
    const now = performance.now()
    const isDouble =
      !!this.lastDown && now - this.lastDown.t < 350 && Math.hypot(this.lastDown.x - sx, this.lastDown.y - sy) < 14
    this.lastDown = isDouble ? null : { t: now, x: sx, y: sy }

    const tool = s.tool
    const p = this.world(sx, sy)
    const fingerInPenMode = e.pointerType === 'touch' && s.penMode

    if (e.button === 1 || this.space || tool === 'hand' || (fingerInPenMode && DRAWING_TOOLS.includes(tool))) {
      this.startPan(e, sx, sy)
      return
    }

    switch (tool) {
      case 'select':
        this.downSelect(e, sx, sy, p, isDouble, fingerInPenMode)
        break
      case 'pen':
        this.startDraw(e, p)
        break
      case 'eraser': {
        this.action = { kind: 'erase', pointerId: e.pointerId, last: p, hits: new Set() }
        this.eraseAlong(p, p, e.pointerType)
        break
      }
      case 'rect':
      case 'ellipse':
      case 'line':
      case 'arrow':
        this.action = { kind: 'shape', pointerId: e.pointerId, type: tool, start: p, sx, sy }
        break
      case 'text': {
        const hit = hitTopmost(s.doc.elements, p, this.tolerance(e.pointerType))
        if (hit?.type === 'text') startEditing(hit.id)
        else createTextAt(p[0], p[1])
        break
      }
    }
  }

  private startPan(e: PointerEvent, sx: number, sy: number) {
    this.action = {
      kind: 'pan',
      pointerId: e.pointerId,
      sx,
      sy,
      vp: S().viewport,
      touch: e.pointerType === 'touch',
      moved: false,
    }
    this.updateCursor()
  }

  private startPinch() {
    const touches = [...this.pointers.entries()].filter(([, p]) => p.type === 'touch').slice(-2)
    const [[ida, a], [idb, b]] = touches
    this.pinch = {
      ids: [ida, idb],
      dist: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      vp: S().viewport,
    }
  }

  private downSelect(e: PointerEvent, sx: number, sy: number, p: Point, isDouble: boolean, fingerInPenMode: boolean) {
    const s = S()
    const sel = selectedElements(s)

    // 1. resize / endpoint handles
    if (sel.length) {
      const slop = e.pointerType === 'touch' ? 22 : e.pointerType === 'pen' ? 14 : 9
      const h = hitHandle(getHandles(sel, s.viewport), sx, sy, slop)
      if (h) {
        const before = s.doc.elements
        if (h.id === 'p1' || h.id === 'p2') {
          const orig = sel[0] as LineEl
          this.action = { kind: 'endpoint', pointerId: e.pointerId, which: h.id === 'p1' ? 1 : 2, id: orig.id, before, sx, sy, orig }
        } else {
          this.action = {
            kind: 'resize',
            pointerId: e.pointerId,
            handle: h.id,
            sx,
            sy,
            box: geometricBounds(sel)!,
            before,
            ids: new Set(sel.map((x) => x.id)),
            lockText: sel.length === 1 && sel[0].type === 'text',
          }
        }
        this.updateCursor(h.cursor)
        return
      }
    }

    const hit = hitTopmost(s.doc.elements, p, this.tolerance(e.pointerType))

    // 2. double click / tap: edit text, or create text on empty canvas
    if (isDouble) {
      if (hit?.type === 'text') {
        startEditing(hit.id)
        return
      }
      if (!hit) {
        createTextAt(p[0], p[1])
        return
      }
    }

    // 3. press on an element (or inside a multi-selection frame): select + start moving
    const frame = sel.length > 1 ? selectionFrame(sel, s.viewport) : null
    const inFrame = !!frame && pointInBox([sx, sy], frame)
    if (hit || (inFrame && !e.shiftKey)) {
      let ids = s.selectedIds
      const wasSelected = !!hit && ids.includes(hit.id)
      if (hit && e.shiftKey) {
        ids = wasSelected ? ids.filter((id) => id !== hit.id) : [...ids, hit.id]
      } else if (hit && !wasSelected && !inFrame) {
        ids = [hit.id]
      }
      s.select(ids)
      if (!ids.length) return
      this.action = {
        kind: 'move',
        pointerId: e.pointerId,
        sx,
        sy,
        start: p,
        before: s.doc.elements,
        base: s.doc.elements,
        ids: new Set(ids),
        moved: false,
        clickedId: hit?.id ?? null,
        wasSelected,
        alt: e.altKey,
      }
      return
    }

    // 4. empty canvas: fingers pan once a pencil is in use; otherwise draw a selection marquee
    if (fingerInPenMode) {
      this.startPan(e, sx, sy)
      return
    }
    const base = e.shiftKey ? s.selectedIds : []
    s.select(base)
    this.action = { kind: 'marquee', pointerId: e.pointerId, start: p, base }
  }

  private startDraw(e: PointerEvent, p: Point) {
    const s = S()
    const real = e.pointerType === 'pen'
    const el: FreedrawEl = {
      id: newElementId(),
      type: 'freedraw',
      color: s.style.color,
      size: s.style.size,
      pressure: real,
      points: [[p[0], p[1], pressureOf(e)]],
    }
    this.action = { kind: 'draw', pointerId: e.pointerId, el }
    s.setDraft(el)
  }

  /* ---------- pointer move ---------- */

  private onMove(e: PointerEvent) {
    const info = this.pointers.get(e.pointerId)
    const [sx, sy] = this.local(e)
    if (info) {
      info.x = sx
      info.y = sy
      // a drag is not the first half of a double-click
      if (this.lastDown && Math.hypot(this.lastDown.x - sx, this.lastDown.y - sy) > 14) this.lastDown = null
    }

    if (this.pinch) {
      if (this.pinch.ids.includes(e.pointerId)) this.updatePinch()
      return
    }

    const a = this.action
    if (!a) {
      this.hover(e, sx, sy)
      return
    }
    if (a.pointerId !== e.pointerId) return
    e.preventDefault()
    const s = S()

    switch (a.kind) {
      case 'pan': {
        if (Math.hypot(sx - a.sx, sy - a.sy) > DRAG_THRESHOLD) a.moved = true
        s.setViewport({ ...a.vp, x: a.vp.x + sx - a.sx, y: a.vp.y + sy - a.sy })
        break
      }
      case 'draw': {
        const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
        const list = events.length ? events : [e]
        const pts: StrokePoint[] = a.el.points.slice()
        for (const ev of list) {
          const [lx, ly] = this.local(ev)
          const [wx, wy] = this.world(lx, ly)
          const last = pts[pts.length - 1]
          if (Math.abs(last[0] - wx) < 0.05 && Math.abs(last[1] - wy) < 0.05) continue
          pts.push([wx, wy, pressureOf(ev)])
        }
        a.el = { ...a.el, points: pts }
        s.setDraft(a.el)
        break
      }
      case 'shape': {
        if (Math.hypot(sx - a.sx, sy - a.sy) < DRAG_THRESHOLD) return
        s.setDraft(this.shapeFromDrag(a.type, a.start, this.world(sx, sy), e.shiftKey))
        break
      }
      case 'marquee': {
        const p = this.world(sx, sy)
        const box = normalizeBox(a.start[0], a.start[1], p[0], p[1])
        s.setMarquee(box)
        const inside = s.doc.elements
          .filter((el) => {
            const b = geometricBounds([el])!
            return b.minX >= box.minX && b.maxX <= box.maxX && b.minY >= box.minY && b.maxY <= box.maxY
          })
          .map((el) => el.id)
        const ids = [...new Set([...a.base, ...inside])]
        if (ids.length !== s.selectedIds.length || ids.some((id, i) => id !== s.selectedIds[i])) s.select(ids)
        break
      }
      case 'move': {
        if (!a.moved) {
          if (Math.hypot(sx - a.sx, sy - a.sy) < DRAG_THRESHOLD) return
          a.moved = true
          if (a.alt) {
            // option/alt-drag duplicates the selection and drags the copies
            const originals = a.base.filter((el) => a.ids.has(el.id))
            const clones = cloneWithNewIds(originals, 0, 0)
            a.base = [...a.base, ...clones]
            a.ids = new Set(clones.map((c) => c.id))
            s.select([...a.ids])
          }
        }
        const p = this.world(sx, sy)
        const dx = p[0] - a.start[0]
        const dy = p[1] - a.start[1]
        s.setElementsLive(a.base.map((el) => (a.ids.has(el.id) ? translateEl(el, dx, dy) : el)))
        break
      }
      case 'resize': {
        const z = s.viewport.zoom
        const dx = (sx - a.sx) / z
        const dy = (sy - a.sy) / z
        const [fx, fy] = HANDLE_DIR[a.handle as keyof typeof HANDLE_DIR]
        const b = a.box
        let x0 = b.minX, x1 = b.maxX, y0 = b.minY, y1 = b.maxY
        if (fx === 1) x1 += dx
        if (fx === -1) x0 += dx
        if (fy === 1) y1 += dy
        if (fy === -1) y0 += dy
        const w = b.maxX - b.minX
        const h = b.maxY - b.minY
        if ((e.shiftKey || a.lockText) && fx !== 0 && fy !== 0 && w > 0 && h > 0) {
          const scx = (x1 - x0) / w
          const scy = (y1 - y0) / h
          const sc = Math.max(Math.abs(scx), Math.abs(scy))
          const nw = w * sc * Math.sign(scx || 1)
          const nh = h * sc * Math.sign(scy || 1)
          if (fx === 1) x1 = x0 + nw
          else x0 = x1 - nw
          if (fy === 1) y1 = y0 + nh
          else y0 = y1 - nh
        }
        const to: Box = { minX: x0, minY: y0, maxX: x1, maxY: y1 }
        s.setElementsLive(a.before.map((el) => (a.ids.has(el.id) ? scaleEl(el, b, to, a.lockText) : el)))
        break
      }
      case 'endpoint': {
        const z = s.viewport.zoom
        const o = a.orig
        let nx = (a.which === 1 ? o.x1 : o.x2) + (sx - a.sx) / z
        let ny = (a.which === 1 ? o.y1 : o.y2) + (sy - a.sy) / z
        if (e.shiftKey) {
          const [ax, ay] = a.which === 1 ? [o.x2, o.y2] : [o.x1, o.y1]
          ;[nx, ny] = snapAngle(ax, ay, nx, ny)
        }
        const next: LineEl = a.which === 1 ? { ...o, x1: nx, y1: ny } : { ...o, x2: nx, y2: ny }
        s.setElementsLive(a.before.map((el) => (el.id === a.id ? next : el)))
        break
      }
      case 'erase': {
        const p = this.world(sx, sy)
        this.eraseAlong(a.last, p, e.pointerType)
        a.last = p
        break
      }
    }
  }

  private hover(e: PointerEvent, sx: number, sy: number) {
    if (e.pointerType === 'touch') return
    const s = S()
    if (s.tool !== 'select' || this.space) {
      s.setHovered(null)
      return
    }
    const sel = selectedElements(s)
    const h = sel.length ? hitHandle(getHandles(sel, s.viewport), sx, sy, 9) : null
    if (h) {
      this.updateCursor(h.cursor)
      s.setHovered(null)
      return
    }
    this.updateCursor()
    const hit = hitTopmost(s.doc.elements, this.world(sx, sy), this.tolerance(e.pointerType))
    s.setHovered(hit && !s.selectedIds.includes(hit.id) ? hit.id : null)
  }

  private updatePinch() {
    const pz = this.pinch!
    const a = this.pointers.get(pz.ids[0])
    const b = this.pointers.get(pz.ids[1])
    if (!a || !b) return
    const dist = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1)
    const cx = (a.x + b.x) / 2
    const cy = (a.y + b.y) / 2
    const zoom = clamp(pz.vp.zoom * (dist / pz.dist), MIN_ZOOM, MAX_ZOOM)
    const wx = (pz.cx - pz.vp.x) / pz.vp.zoom
    const wy = (pz.cy - pz.vp.y) / pz.vp.zoom
    S().setViewport({ zoom, x: cx - wx * zoom, y: cy - wy * zoom })
  }

  private shapeFromDrag(type: 'rect' | 'ellipse' | 'line' | 'arrow', a: Point, b: Point, shift: boolean): El {
    const s = S()
    const base = { id: 'draft', color: s.style.color, size: s.style.size }
    if (type === 'line' || type === 'arrow') {
      const [x2, y2] = shift ? snapAngle(a[0], a[1], b[0], b[1]) : b
      return { ...base, type, x1: a[0], y1: a[1], x2, y2 }
    }
    let w = b[0] - a[0]
    let h = b[1] - a[1]
    if (shift) {
      const m = Math.max(Math.abs(w), Math.abs(h))
      w = m * Math.sign(w || 1)
      h = m * Math.sign(h || 1)
    }
    const box = normalizeBox(a[0], a[1], a[0] + w, a[1] + h)
    return {
      ...base,
      type,
      fill: s.style.fill,
      x: box.minX,
      y: box.minY,
      w: box.maxX - box.minX,
      h: box.maxY - box.minY,
    }
  }

  private eraseAlong(from: Point, to: Point, pointerType: string) {
    const a = this.action
    if (!a || a.kind !== 'erase') return
    const s = S()
    const tol = this.tolerance(pointerType) + 2 / s.viewport.zoom
    const len = Math.hypot(to[0] - from[0], to[1] - from[1])
    const steps = Math.max(1, Math.ceil(len / tol))
    let changed = false
    for (const el of s.doc.elements) {
      if (a.hits.has(el.id)) continue
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const p: Point = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
        if (hitTest(el, p, tol)) {
          a.hits.add(el.id)
          changed = true
          break
        }
      }
    }
    if (changed) s.setErasing([...a.hits])
  }

  /* ---------- pointer up ---------- */

  private onUp(e: PointerEvent, cancelled = false) {
    const wasPinchMember = this.pinch?.ids.includes(e.pointerId)
    this.pointers.delete(e.pointerId)
    if (this.pinch) {
      if (wasPinchMember) {
        this.pinch = null
        // the remaining finger should not suddenly start a stroke
      }
      return
    }
    const a = this.action
    if (!a || a.pointerId !== e.pointerId) return
    this.action = null
    const s = S()

    if (cancelled) {
      this.action = a
      this.cancel()
      return
    }

    switch (a.kind) {
      case 'pan':
        if (!a.moved && a.touch && s.tool === 'select') s.select([])
        break
      case 'draw': {
        const el = { ...a.el }
        s.setDraft(null)
        s.commit([...s.doc.elements, el])
        break
      }
      case 'shape': {
        let el = s.draft
        s.setDraft(null)
        if (!el) el = this.defaultShape(a.type, a.start)
        const final = { ...el, id: newElementId() } as El
        s.commit([...s.doc.elements, final])
        s.setTool('select')
        s.select([final.id])
        break
      }
      case 'marquee':
        s.setMarquee(null)
        break
      case 'move':
        if (a.moved) {
          s.commit(s.doc.elements, a.before)
        } else if (a.clickedId && a.wasSelected && !e.shiftKey && s.selectedIds.length > 1) {
          s.select([a.clickedId])
        }
        break
      case 'resize':
      case 'endpoint':
        if (s.doc.elements !== a.before) s.commit(s.doc.elements, a.before)
        break
      case 'erase':
        s.setErasing([])
        if (a.hits.size) s.commit(s.doc.elements.filter((el) => !a.hits.has(el.id)))
        break
    }
    this.updateCursor()
  }

  private defaultShape(type: 'rect' | 'ellipse' | 'line' | 'arrow', p: Point): El {
    const s = S()
    const base = { id: 'draft', color: s.style.color, size: s.style.size }
    if (type === 'line' || type === 'arrow') return { ...base, type, x1: p[0] - 60, y1: p[1], x2: p[0] + 60, y2: p[1] }
    const w = type === 'rect' ? 160 : 120
    const h = type === 'rect' ? 110 : 120
    return { ...base, type, fill: s.style.fill, x: p[0] - w / 2, y: p[1] - h / 2, w, h }
  }

  /* ---------- wheel & gestures ---------- */

  private onWheel(e: WheelEvent) {
    e.preventDefault()
    const s = S()
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1
    const dx = e.deltaX * unit
    const dy = e.deltaY * unit
    const [sx, sy] = this.local(e)
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-clamp(dy, -40, 40) * 0.01)
      s.zoomTo(s.viewport.zoom * factor, [sx, sy])
      return
    }
    const v = s.viewport
    if (e.shiftKey && dx === 0) s.setViewport({ ...v, x: v.x - dy })
    else s.setViewport({ ...v, x: v.x - dx, y: v.y - dy })
  }

  private onGesture(e: Event, phase: 'start' | 'change') {
    e.preventDefault()
    if (this.touchCount() > 0) return // touch pinch is handled with pointer events
    const ge = e as Event & { scale: number; clientX: number; clientY: number }
    const s = S()
    if (phase === 'start') {
      this.gestureZoom = s.viewport.zoom
      return
    }
    s.zoomTo(this.gestureZoom * ge.scale, this.local(ge))
  }
}

function pressureOf(e: PointerEvent) {
  if (e.pointerType !== 'pen') return 0.5
  return e.pressure > 0 ? e.pressure : 0.5
}

function snapAngle(ax: number, ay: number, bx: number, by: number): Point {
  const len = Math.hypot(bx - ax, by - ay)
  const step = Math.PI / 12
  const ang = Math.round(Math.atan2(by - ay, bx - ax) / step) * step
  return [ax + Math.cos(ang) * len, ay + Math.sin(ang) * len]
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function isTyping(e: Event) {
  const t = e.target as HTMLElement | null
  if (!t) return false
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable
}
