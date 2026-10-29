import { create } from 'zustand'
import { resolveBindings } from './bindings'
import { FONT_SIZE, MAX_ZOOM, MIN_ZOOM } from './constants'
import { geometricBounds, unionBounds } from './geometry'
import type { Guide } from './snap'
import { emptyBoard } from './storage'
import type { BoardDoc, Box, El, Style, Tool, Viewport } from './types'

export type ThemePref = 'system' | 'light' | 'dark'
/** Cloud sync state of the current board. 'idle' when cloud storage isn't available. */
export type SyncStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'offline' | 'too-large' | 'error'

/** What caused the latest change to the board's elements (used by live collaboration). */
export type ChangeKind = 'load' | 'live' | 'commit' | 'remote'

/** Another person on the same board, as seen through live collaboration. */
export interface Peer {
  id: number
  name: string
  color: string
  cursor: [number, number] | null
  selection: string[]
  draft: El | null
}

export interface CollabState {
  status: 'off' | 'connecting' | 'live' | 'reconnecting'
  peers: Peer[]
  canUndo: boolean
  canRedo: boolean
}

/** While collaborating, undo/redo go through the shared room so only your own changes are undone. */
let historyDelegate: { undo: () => void; redo: () => void } | null = null
export function setHistoryDelegate(d: typeof historyDelegate) {
  historyDelegate = d
}

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
  /** smart-guide lines shown while dragging (world coordinates) */
  guides: Guide[]
  /** snap to other objects while moving / resizing / drawing */
  snap: boolean
  /** snap to the background dot grid */
  gridSnap: boolean
  /** set once an Apple Pencil / stylus is seen: fingers then pan instead of draw */
  penMode: boolean
  theme: ThemePref
  toast: Toast | null
  /** null until we know whether the cloud endpoint exists */
  cloud: boolean | null
  sync: SyncStatus
  past: El[][]
  future: El[][]
  change: ChangeKind
  /** bumped on every commit, even one that changes nothing (ends a gesture) */
  commitSeq: number
  collab: CollabState

  setDoc: (doc: BoardDoc) => void
  setTitle: (title: string) => void
  /** replace elements without recording history (live drags) */
  setElementsLive: (elements: El[]) => void
  /** replace elements and record `before` as an undo step */
  commit: (elements: El[], before?: El[]) => void
  /** apply changes that arrived from other people (no history, not re-sent) */
  applyRemote: (elements: El[], title: string, updatedAt: number) => void
  setCollab: (patch: Partial<CollabState>) => void
  /** the board's live link was shared: from now on it collaborates live */
  markShared: () => void
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
  setGuides: (g: Guide[]) => void
  setSnap: (on: boolean) => void
  setGridSnap: (on: boolean) => void
  setViewport: (v: Viewport) => void
  zoomTo: (zoom: number, anchor?: [number, number]) => void
  zoomToFit: () => void
  setPenMode: (on: boolean) => void
  setTheme: (t: ThemePref) => void
  showToast: (message: string) => void
  setCloud: (cloud: boolean) => void
  setSync: (sync: SyncStatus) => void
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
  const fallback: Style = { color: 'ink', size: 'm', fill: 'none', fontSize: 'm', stickyColor: 'yellow' }
  try {
    const s = JSON.parse(localStorage.getItem('canvas-style') || 'null')
    if (s && typeof s === 'object') return { ...fallback, ...s }
  } catch {
    /* ignore */
  }
  return fallback
}

function readFlag(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
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
  guides: [],
  snap: readFlag('canvas-snap', true),
  gridSnap: readFlag('canvas-grid', false),
  penMode: false,
  theme: readTheme(),
  toast: null,
  cloud: null,
  sync: 'idle',
  past: [],
  future: [],
  change: 'load',
  commitSeq: 0,
  collab: { status: 'off', peers: [], canUndo: false, canRedo: false },

  setDoc: (doc) =>
    set({
      doc,
      change: 'load',
      loaded: true,
      past: [],
      future: [],
      selectedIds: [],
      editingId: null,
      hoveredId: null,
      draft: null,
      erasing: [],
      marquee: null,
      guides: [],
    }),

  setTitle: (title) =>
    set((s) => ({ doc: { ...s.doc, title, updatedAt: Date.now() }, change: 'commit', commitSeq: s.commitSeq + 1 })),

  setElementsLive: (elements) =>
    set((s) => ({ doc: { ...s.doc, elements: resolveBindings(elements) }, change: 'live' })),

  commit: (input, before) =>
    set((s) => {
      const elements = resolveBindings(input)
      const prev = before ?? s.doc.elements
      if (prev === elements) return { commitSeq: s.commitSeq + 1 }
      const past = [...s.past, prev].slice(-HISTORY_LIMIT)
      return {
        doc: { ...s.doc, elements, updatedAt: Date.now() },
        past,
        future: [],
        change: 'commit',
        commitSeq: s.commitSeq + 1,
      }
    }),

  applyRemote: (elements, title, updatedAt) =>
    set((s) => {
      const ids = new Set(elements.map((e) => e.id))
      return {
        doc: { ...s.doc, elements, title, updatedAt: Math.max(updatedAt, s.doc.updatedAt) },
        change: 'remote',
        selectedIds: s.selectedIds.some((id) => !ids.has(id)) ? s.selectedIds.filter((id) => ids.has(id)) : s.selectedIds,
        hoveredId: s.hoveredId && ids.has(s.hoveredId) ? s.hoveredId : null,
      }
    }),

  setCollab: (patch) => set((s) => ({ collab: { ...s.collab, ...patch } })),

  markShared: () =>
    set((s) =>
      s.doc.shared
        ? {}
        : { doc: { ...s.doc, shared: true, updatedAt: Date.now() }, change: 'commit', commitSeq: s.commitSeq + 1 },
    ),

  undo: () => {
    if (historyDelegate) return historyDelegate.undo()
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
        change: 'commit',
        commitSeq: s.commitSeq + 1,
      }
    })
  },

  redo: () => {
    if (historyDelegate) return historyDelegate.redo()
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
        change: 'commit',
        commitSeq: s.commitSeq + 1,
      }
    })
  },

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
      if (patch.color && el.type !== 'image') next.color = patch.color
      if (patch.stickyColor && el.type === 'sticky') next.color = patch.stickyColor
      if (patch.size && 'size' in el) next.size = patch.size
      if (patch.fill && (el.type === 'rect' || el.type === 'ellipse')) next.fill = patch.fill
      if (patch.fontSize && (el.type === 'text' || el.type === 'sticky' || el.type === 'rect' || el.type === 'ellipse')) {
        next.fontSize = FONT_SIZE[patch.fontSize]
      }
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
  setGuides: (guides) => {
    if (guides.length || get().guides.length) set({ guides })
  },
  setSnap: (snap) => {
    try {
      localStorage.setItem('canvas-snap', snap ? '1' : '0')
    } catch {
      /* ignore */
    }
    set({ snap })
  },
  setGridSnap: (gridSnap) => {
    try {
      localStorage.setItem('canvas-grid', gridSnap ? '1' : '0')
    } catch {
      /* ignore */
    }
    set({ gridSnap })
  },
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
  setCloud: (cloud) => {
    if (get().cloud !== cloud) set({ cloud })
  },
  setSync: (sync) => {
    if (get().sync !== sync) set({ sync })
  },

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
