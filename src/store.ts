import { create } from 'zustand'
import { FONT_SIZE, MAX_ZOOM, MIN_ZOOM } from './constants'
import { geometricBounds, unionBounds } from './geometry'
import { emptyBoard } from './storage'
import type { BoardDoc, Box, El, Style, Tool, Viewport } from './types'

export type ThemePref = 'system' | 'light' | 'dark'

interface Toast {
  id: number
  message: string
}

interface State {
  doc: BoardDoc
  loaded: boolean
  viewport: Viewport
  tool: Tool
  style: Style
  selectedIds: string[]
  editingId: string | null
  hoveredId: string | null
  /** element being drawn but not yet committed */
  draft: El | null
  /** ids marked by the eraser during a drag */
  erasing: string[]
  marquee: Box | null
  /** set once an Apple Pencil / stylus is seen: fingers then pan instead of draw */
  penMode: boolean
  theme: ThemePref
  toast: Toast | null
  past: El[][]
  future: El[][]

  setDoc: (doc: BoardDoc) => void
  setTitle: (title: string) => void
  /** replace elements without recording history (live drags) */
  setElementsLive: (elements: El[]) => void
  /** replace elements and record `before` as an undo step */
  commit: (elements: El[], before?: El[]) => void
  undo: () => void
  redo: () => void
  setTool: (tool: Tool) => void
  setStyle: (patch: Partial<Style>) => void
  select: (ids: string[]) => void
  setEditing: (id: string | null) => void
  setHovered: (id: string | null) => void
  setDraft: (el: El | null) => void
  setErasing: (ids: string[]) => void
  setMarquee: (b: Box | null) => void
  setViewport: (v: Viewport) => void
  zoomTo: (zoom: number, anchor?: [number, number]) => void
  zoomToFit: () => void
  setPenMode: (on: boolean) => void
  setTheme: (t: ThemePref) => void
  showToast: (message: string) => void
  deleteSelected: () => void
}

const HISTORY_LIMIT = 200

function readTheme(): ThemePref {
  try {
    const t = localStorage.getItem('canvas-theme')
    if (t === 'light' || t === 'dark' || t === 'system') return t
  } catch {
    /* ignore */
  }
  return 'system'
}

function readStyle(): Style {
  const fallback: Style = { color: 'ink', size: 'm', fill: 'none', fontSize: 'm' }
  try {
    const s = JSON.parse(localStorage.getItem('canvas-style') || 'null')
    if (s && typeof s === 'object') return { ...fallback, ...s }
  } catch {
    /* ignore */
  }
  return fallback
}

let toastSeq = 0

export const useStore = create<State>((set, get) => ({
  doc: emptyBoard(),
  loaded: false,
  viewport: { x: 0, y: 0, zoom: 1 },
  tool: 'pen',
  style: readStyle(),
  selectedIds: [],
  editingId: null,
  hoveredId: null,
  draft: null,
  erasing: [],
  marquee: null,
  penMode: false,
  theme: readTheme(),
  toast: null,
  past: [],
  future: [],

  setDoc: (doc) =>
    set({
      doc,
      loaded: true,
      past: [],
      future: [],
      selectedIds: [],
      editingId: null,
      hoveredId: null,
      draft: null,
      erasing: [],
      marquee: null,
    }),

  setTitle: (title) => set((s) => ({ doc: { ...s.doc, title, updatedAt: Date.now() } })),

  setElementsLive: (elements) => set((s) => ({ doc: { ...s.doc, elements } })),

  commit: (elements, before) =>
    set((s) => {
      const prev = before ?? s.doc.elements
      if (prev === elements) return {}
      const past = [...s.past, prev].slice(-HISTORY_LIMIT)
      return { doc: { ...s.doc, elements, updatedAt: Date.now() }, past, future: [] }
    }),

  undo: () =>
    set((s) => {
      if (!s.past.length) return {}
      const prev = s.past[s.past.length - 1]
      const ids = new Set(prev.map((e) => e.id))
      return {
        doc: { ...s.doc, elements: prev, updatedAt: Date.now() },
        past: s.past.slice(0, -1),
        future: [s.doc.elements, ...s.future],
        selectedIds: s.selectedIds.filter((id) => ids.has(id)),
        editingId: null,
      }
    }),

  redo: () =>
    set((s) => {
      if (!s.future.length) return {}
      const next = s.future[0]
      const ids = new Set(next.map((e) => e.id))
      return {
        doc: { ...s.doc, elements: next, updatedAt: Date.now() },
        past: [...s.past, s.doc.elements],
        future: s.future.slice(1),
        selectedIds: s.selectedIds.filter((id) => ids.has(id)),
        editingId: null,
      }
    }),

  setTool: (tool) =>
    set((s) => ({
      tool,
      selectedIds: tool === 'select' ? s.selectedIds : [],
      hoveredId: null,
    })),

  setStyle: (patch) => {
    const s = get()
    const style = { ...s.style, ...patch }
    try {
      localStorage.setItem('canvas-style', JSON.stringify(style))
    } catch {
      /* ignore */
    }
    set({ style })
    if (!s.selectedIds.length) return
    const ids = new Set(s.selectedIds)
    let changed = false
    const elements = s.doc.elements.map((el) => {
      if (!ids.has(el.id)) return el
      const next = { ...el } as El & Record<string, unknown>
      if (patch.color) next.color = patch.color
      if (patch.size && 'size' in el) next.size = patch.size
      if (patch.fill && (el.type === 'rect' || el.type === 'ellipse')) next.fill = patch.fill
      if (patch.fontSize && el.type === 'text') next.fontSize = FONT_SIZE[patch.fontSize]
      changed = true
      return next as El
    })
    if (changed) get().commit(elements)
  },

  select: (ids) => set({ selectedIds: ids }),
  setEditing: (id) => set({ editingId: id }),
  setHovered: (id) => {
    if (get().hoveredId !== id) set({ hoveredId: id })
  },
  setDraft: (draft) => set({ draft }),
  setErasing: (erasing) => set({ erasing }),
  setMarquee: (marquee) => set({ marquee }),
  setViewport: (viewport) => set({ viewport }),

  zoomTo: (zoom, anchor) => {
    const v = get().viewport
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
    const [ax, ay] = anchor ?? [window.innerWidth / 2, window.innerHeight / 2]
    const wx = (ax - v.x) / v.zoom
    const wy = (ay - v.y) / v.zoom
    set({ viewport: { zoom: z, x: ax - wx * z, y: ay - wy * z } })
  },

  zoomToFit: () => {
    const { doc, selectedIds } = get()
    const sel = doc.elements.filter((e) => selectedIds.includes(e.id))
    const b = unionBounds(sel.length ? sel : doc.elements)
    if (!b) {
      set({ viewport: { x: 0, y: 0, zoom: 1 } })
      return
    }
    const vw = window.innerWidth
    const vh = window.innerHeight
    const pad = 96
    const w = Math.max(b.maxX - b.minX, 1)
    const h = Math.max(b.maxY - b.minY, 1)
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((vw - pad * 2) / w, (vh - pad * 2) / h, 2)))
    set({
      viewport: {
        zoom,
        x: vw / 2 - ((b.minX + b.maxX) / 2) * zoom,
        y: vh / 2 - ((b.minY + b.maxY) / 2) * zoom,
      },
    })
  },

  setPenMode: (penMode) => {
    if (get().penMode !== penMode) set({ penMode })
  },

  setTheme: (theme) => {
    try {
      localStorage.setItem('canvas-theme', theme)
    } catch {
      /* ignore */
    }
    set({ theme })
  },

  showToast: (message) => set({ toast: { id: ++toastSeq, message } }),

  deleteSelected: () => {
    const s = get()
    if (!s.selectedIds.length) return
    const ids = new Set(s.selectedIds)
    s.commit(s.doc.elements.filter((e) => !ids.has(e.id)))
    set({ selectedIds: [], hoveredId: null })
  },
}))

export function selectedElements(s: Pick<State, 'doc' | 'selectedIds'>) {
  if (!s.selectedIds.length) return []
  const ids = new Set(s.selectedIds)
  return s.doc.elements.filter((e) => ids.has(e.id))
}

export function selectionBox(s: Pick<State, 'doc' | 'selectedIds'>) {
  return geometricBounds(selectedElements(s))
}
