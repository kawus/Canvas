import { create } from 'zustand'
import { getMe, setMyName } from './collab'
import { useStore } from './store'

/**
 * Feedback on shared boards: anyone with the link can like an item or leave a
 * short note on it, with just a name (no account). The owner sees a quiet
 * count in the top bar, glides to each note and resolves it. Feedback lives
 * next to the board (api/feedback.js), never in it: it's not in exports,
 * presentations or link previews.
 */

export interface FbPerson {
  id: string
  name: string
  color: string
}
export interface FbItem {
  id: string
  kind: 'like' | 'note'
  target: string
  by: FbPerson
  text?: string
  at: number
  resolved?: boolean
}

export const NOTE_MAX = 280

interface FbState {
  /** the board this feedback belongs to (null: none loaded, or no cloud) */
  board: string | null
  items: FbItem[]
  /** whether the owner lets viewers leave feedback */
  on: boolean
  /** the item a viewer tapped (shows Like / Note above it) */
  target: string | null
  /** the item a note is being written about */
  compose: string | null
  /** the note whose bubble is open */
  open: string | null
  /** the owner's feedback list */
  panel: boolean
  /** a note being sent, or a failure to show */
  sending: boolean
  error: string | null
}

export const useFeedback = create<FbState>(() => ({
  board: null,
  items: [],
  on: true,
  target: null,
  compose: null,
  open: null,
  panel: false,
  sending: false,
  error: null,
}))

const F = () => useFeedback.getState()
const set = (p: Partial<FbState>) => useFeedback.setState(p)
const endpoint = (id: string) => `api/feedback?id=${encodeURIComponent(id)}`
const isJson = (r: Response) => (r.headers.get('content-type') || '').includes('application/json')

/* ---------- who I am ---------- */

/** Whether this person has told us their name (rather than the made-up one live editing starts with). */
export function hasChosenName() {
  try {
    return localStorage.getItem('canvas-me-named') === '1'
  } catch {
    return false
  }
}

export function chooseName(name: string) {
  setMyName(name)
  try {
    localStorage.setItem('canvas-me-named', '1')
  } catch {
    /* ignore */
  }
}

export function me(): FbPerson {
  const m = getMe()
  return { id: m.id, name: m.name, color: m.color }
}

/** Someone who only liked things before giving a name. */
export const SOMEONE = 'Someone'

/** The latest name each person gave (a like made before they typed a name then shows up as theirs too). */
export function namesById(items: FbItem[]) {
  const names = new Map<string, string>()
  for (const x of [...items].sort((a, b) => a.at - b.at)) if (x.by.name !== SOMEONE) names.set(x.by.id, x.by.name)
  return names
}

/* ---------- loading ---------- */

let inflight: Promise<void> | null = null

/** Fetch the current board's feedback (quietly does nothing without the cloud). */
export function loadFeedback() {
  const id = useStore.getState().doc.id
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await fetch(endpoint(id), { cache: 'no-store' })
      if (useStore.getState().doc.id !== id) return
      if (!r.ok || !isJson(r)) {
        if (F().board !== null) set({ board: null, items: [] })
        return
      }
      const data = (await r.json()) as { on: boolean; items: FbItem[] }
      const same = F().board === id
      set({ board: id, on: data.on, items: data.items, ...(same ? {} : { target: null, compose: null, open: null, panel: false }) })
    } catch {
      /* offline: keep what we have */
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** Keep feedback fresh while a board is open: on opening, on coming back to the tab, and every minute. */
export function startFeedback() {
  let last = ''
  const unsub = useStore.subscribe((s) => {
    const id = s.loaded ? s.doc.id : ''
    // a board that's only on this device has no feedback; wait until it's synced or opened from a link
    if (id && id !== last) {
      last = id
      set({ board: null, items: [], target: null, compose: null, open: null, panel: false })
      void loadFeedback()
    }
  })
  const onVisible = () => {
    if (document.visibilityState === 'visible' && useStore.getState().loaded) void loadFeedback()
  }
  document.addEventListener('visibilitychange', onVisible)
  const timer = window.setInterval(onVisible, 60_000)
  // the first save of a new board puts it in the cloud: look again once it's synced
  const unsubSync = useStore.subscribe((s, prev) => {
    if (s.sync === 'saved' && prev.sync !== 'saved' && F().board === null) void loadFeedback()
  })
  return () => {
    unsub()
    unsubSync()
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(timer)
  }
}

/* ---------- what people do ---------- */

async function post(body: object): Promise<{ item?: FbItem; removed?: string } | null> {
  const id = F().board
  if (!id) return null
  try {
    const r = await fetch(endpoint(id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok || !isJson(r)) {
      const msg = r.status === 429 ? 'That’s a lot of feedback for now. Try again in a while.' : r.status === 403 ? 'Feedback is turned off for this board.' : 'Couldn’t send that. Check your connection and try again.'
      set({ error: msg })
      if (r.status === 403) set({ on: false })
      return null
    }
    return await r.json()
  } catch {
    set({ error: 'Couldn’t send that. Check your connection and try again.' })
    return null
  }
}

export const myLike = (items: FbItem[], target: string, who = me().id) =>
  items.some((x) => x.kind === 'like' && x.target === target && x.by.id === who)

/** Like an item, or take the like back. Shows at once; undone if it can't be sent. */
export async function toggleLike(target: string) {
  // a like doesn't ask for a name; until there is one it's from "Someone", not the made-up live-editing name
  const by = hasChosenName() ? me() : { ...me(), name: SOMEONE }
  const field = `l:${target}:${by.id}`
  const liked = myLike(F().items, target, by.id)
  const before = F().items
  set({
    error: null,
    items: liked ? before.filter((x) => x.id !== field) : [...before, { id: field, kind: 'like', target, by, at: Date.now() }],
  })
  const res = await post({ kind: 'like', target, by, on: !liked })
  if (!res) set({ items: before })
}

export async function sendNote(target: string, text: string) {
  const clean = text.trim().slice(0, NOTE_MAX)
  if (!clean) return false
  set({ sending: true, error: null })
  const res = await post({ kind: 'note', target, text: clean, by: me() })
  set({ sending: false })
  if (!res?.item) return false
  set({ items: [...F().items, res.item], compose: null, target: null })
  return true
}

async function patch(body: object) {
  const s = useStore.getState()
  const id = F().board
  if (!id || !s.doc.key) return
  try {
    const r = await fetch(endpoint(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Edit-Key': s.doc.key },
      body: JSON.stringify(body),
    })
    if (!r.ok || !isJson(r)) return
    const data = (await r.json()) as { on: boolean; items: FbItem[] }
    set({ on: data.on, items: data.items })
  } catch {
    /* offline: the next refresh shows the real state */
  }
}

export function resolveNote(id: string, resolved = true) {
  set({ items: F().items.map((x) => (x.id === id ? { ...x, resolved } : x)), open: resolved && F().open === id ? null : F().open })
  void patch({ resolve: [id], resolved })
}

export function setFeedbackOn(on: boolean) {
  set({ on })
  void patch({ on })
}

/* ---------- seen / new ---------- */

const seenKey = (id: string) => `canvas-fb-seen:${id}`

export function seenAt(id: string) {
  try {
    return Number(localStorage.getItem(seenKey(id)) || 0)
  } catch {
    return 0
  }
}

export function markSeen(id: string, at = Date.now()) {
  try {
    localStorage.setItem(seenKey(id), String(at))
  } catch {
    /* ignore */
  }
}

/** Open notes on items that still exist, oldest first. */
export function openNotes(items: FbItem[], ids: Set<string>) {
  return items.filter((x) => x.kind === 'note' && !x.resolved && ids.has(x.target))
}

/** How much open feedback each of these boards has (for the boards list). */
export async function feedbackCounts(ids: string[]): Promise<Record<string, { open: number; latest: number }>> {
  if (!ids.length) return {}
  try {
    const r = await fetch(`api/feedback?ids=${ids.slice(0, 60).join(',')}`, { cache: 'no-store' })
    if (!r.ok || !isJson(r)) return {}
    return ((await r.json()) as { counts: Record<string, { open: number; latest: number }> }).counts
  } catch {
    return {}
  }
}

/** "2 h ago", "yesterday", "3 Nov" */
export function timeAgo(at: number, now = Date.now()) {
  const m = Math.round((now - at) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d} days ago`
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
