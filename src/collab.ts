import type { Client, Json, LiveList, LiveMap, LiveObject, Lson, Room } from '@liveblocks/client'
import { toWorld } from './handles'
import { setHistoryDelegate, useStore, type Peer } from './store'
import type { El } from './types'

/**
 * Live collaboration through Liveblocks. Each shared board is a room holding
 *   elements: LiveMap<id, element>   (last writer wins per element)
 *   order:    LiveList<id>           (z-order)
 *   meta:     LiveObject { title, updatedAt }
 * plus presence (cursor, selection, in-progress drawing) for live cursors.
 *
 * The local store stays the source of truth for rendering: local changes are
 * diffed and written to the room; changes from others are applied back with
 * `applyRemote`. Only boards that have been shared connect, which keeps usage
 * of the free plan low.
 */

type Presence = {
  name: string
  color: string
  cursor: [number, number] | null
  selection: string[]
  /** the shape or stroke being drawn right now (an El) */
  draft: Json
}
type Meta = { title: string; updatedAt: number }
type Storage = {
  elements: LiveMap<string, Json>
  order: LiveList<Lson>
  meta: LiveObject<Meta>
}

const S = () => useStore.getState()

/* ---------- Who am I ---------- */

const ADJ = ['Calm', 'Bright', 'Swift', 'Quiet', 'Bold', 'Gentle', 'Clever', 'Sunny', 'Lucky', 'Brave', 'Witty', 'Merry']
const ANIMALS = ['Otter', 'Fox', 'Panda', 'Koala', 'Heron', 'Lynx', 'Robin', 'Seal', 'Tiger', 'Whale', 'Owl', 'Bison']
const COLORS = ['#0a84ff', '#bf5af2', '#ff375f', '#ff9f0a', '#30d158', '#64d2ff', '#5e5ce6', '#ff6482']

export interface Me {
  id: string
  name: string
  color: string
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

export function getMe(): Me {
  try {
    const saved = JSON.parse(localStorage.getItem('canvas-me') || 'null')
    if (saved?.id && saved.name && saved.color) return saved
  } catch {
    /* ignore */
  }
  const me = {
    id: [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20),
    name: `${pick(ADJ)} ${pick(ANIMALS)}`,
    color: pick(COLORS),
  }
  try {
    localStorage.setItem('canvas-me', JSON.stringify(me))
  } catch {
    /* ignore */
  }
  return me
}

export function setMyName(name: string) {
  const me = { ...getMe(), name: name.trim().slice(0, 40) || getMe().name }
  try {
    localStorage.setItem('canvas-me', JSON.stringify(me))
  } catch {
    /* ignore */
  }
  current?.room.updatePresence({ name: me.name })
}

/* ---------- Client ---------- */

let config: Promise<{ enabled: boolean; baseUrl?: string }> | null = null
let client: Client | null = null
// loaded on demand, so boards that aren't shared never download it
type Lib = typeof import('@liveblocks/client')
let lib: Lib | null = null

function getConfig() {
  config ??= fetch('api/collab', { cache: 'no-store' })
    .then(async (r) => {
      if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return { enabled: false }
      return (await r.json()) as { enabled: boolean; baseUrl?: string }
    })
    .catch(() => ({ enabled: false }))
  return config
}

export async function collabAvailable() {
  return (await getConfig()).enabled
}

function getClient(baseUrl?: string) {
  client ??= lib!.createClient({
    throttle: 40,
    // leave the room when the tab has been in the background for a while
    backgroundKeepAliveTimeout: 60_000,
    badgeLocation: 'bottom-right',
    ...(baseUrl ? { baseUrl } : {}),
    authEndpoint: async (room) => {
      const me = getMe()
      const res = await fetch('api/collab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room, userId: me.id, name: me.name, color: me.color }),
      })
      return res.json()
    },
  })
  return client
}

/* ---------- Room session ---------- */

interface Session {
  boardId: string
  room: Room<Presence, Storage>
  leave: () => void
  storage: Storage | null
  /** true while we write our own changes, so our subscription ignores them */
  writing: boolean
  paused: boolean
  cleanup: (() => void)[]
}

let current: Session | null = null

export function isLive() {
  return !!current?.storage
}

export function stopCollab() {
  if (!current) return
  current.cleanup.forEach((f) => f())
  current.leave()
  current = null
  setHistoryDelegate(null)
  S().setCollab({ status: 'off', peers: [], canUndo: false, canRedo: false })
}

export async function startCollab(boardId: string) {
  if (current?.boardId === boardId) return
  stopCollab()
  const cfg = await getConfig()
  if (!cfg.enabled) return
  lib ??= await import('@liveblocks/client')
  if (S().doc.id !== boardId || current) return
  const { LiveList, LiveMap, LiveObject } = lib

  const me = getMe()
  const { room, leave } = getClient(cfg.baseUrl).enterRoom<Presence, Storage>(`canvas-${boardId}`, {
    initialPresence: { name: me.name, color: me.color, cursor: null, selection: [], draft: null },
    initialStorage: () => ({
      elements: new LiveMap<string, Json>(),
      order: new LiveList<Lson>([]),
      meta: new LiveObject<Meta>({ title: S().doc.title, updatedAt: 0 }),
    }),
  })
  const session: Session = { boardId, room, leave, storage: null, writing: false, paused: false, cleanup: [] }
  current = session
  S().setCollab({ status: 'connecting', peers: [] })

  session.cleanup.push(
    room.subscribe('status', (status) => {
      S().setCollab({
        status: status === 'connected' ? 'live' : status === 'reconnecting' ? 'reconnecting' : 'connecting',
      })
    }),
    room.subscribe('others', (others) => {
      const peers: Peer[] = others
        .filter((o) => o.presence)
        .map((o) => ({
          id: o.connectionId,
          name: o.presence.name,
          color: o.presence.color,
          cursor: o.presence.cursor,
          selection: o.presence.selection ?? [],
          draft: (o.presence.draft ?? null) as unknown as El | null,
        }))
      S().setCollab({ peers })
    }),
    room.subscribe('history', ({ canUndo, canRedo }) => S().setCollab({ canUndo, canRedo })),
  )

  const { root } = await room.getStorage()
  if (current !== session) return
  const storage: Storage = {
    elements: root.get('elements'),
    order: root.get('order'),
    meta: root.get('meta'),
  }
  session.storage = storage
  reconcile(session)

  setHistoryDelegate({
    undo: () => {
      endGesture(session)
      room.history.undo()
    },
    redo: () => {
      endGesture(session)
      room.history.redo()
    },
  })

  // others' changes → local store
  session.cleanup.push(
    room.subscribe(
      root,
      (updates) => {
        if (session.writing) return
        const changed = new Set<string>()
        for (const u of updates) {
          if (u.type === 'LiveMap' && u.node === storage.elements) for (const k of Object.keys(u.updates)) changed.add(k)
        }
        applyFromStorage(storage, changed)
      },
      { isDeep: true },
    ),
  )

  // local changes → room
  session.cleanup.push(
    useStore.subscribe((s, p) => {
      if (s.doc.id !== session.boardId) return
      if (s.doc !== p.doc && s.change !== 'remote' && s.change !== 'load') write(session, p.doc.elements, s.doc.elements, s.doc.title)
      if (s.change === 'live' && s.doc !== p.doc && !session.paused) {
        // a drag or typing: merge everything until the gesture ends into one undo step
        room.history.pause()
        session.paused = true
      }
      if (s.commitSeq !== p.commitSeq) endGesture(session)
      if (s.selectedIds !== p.selectedIds) room.updatePresence({ selection: s.selectedIds })
      if (s.draft !== p.draft) room.updatePresence({ draft: s.draft as unknown as Json })
    }),
  )

  // live cursor
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    room.updatePresence({ cursor: toWorld(S().viewport, e.clientX, e.clientY) })
  }
  const onLeave = () => room.updatePresence({ cursor: null })
  window.addEventListener('pointermove', onMove)
  document.documentElement.addEventListener('pointerleave', onLeave)
  session.cleanup.push(() => {
    window.removeEventListener('pointermove', onMove)
    document.documentElement.removeEventListener('pointerleave', onLeave)
  })
}

function endGesture(session: Session) {
  if (!session.paused) return
  session.paused = false
  session.room.history.resume()
}

/** Elements in z-order as stored in the room. */
function readStorage(storage: Storage): El[] {
  const seen = new Set<string>()
  const out: El[] = []
  storage.order.forEach((v) => {
    const id = String(v)
    if (seen.has(id)) return
    seen.add(id)
    const el = storage.elements.get(id) as unknown as El | undefined
    if (el) out.push(el)
  })
  // anything in the map that lost its place in the order goes on top
  for (const [id, el] of storage.elements.entries()) if (!seen.has(id)) out.push(el as unknown as El)
  return out
}

function applyFromStorage(storage: Storage, changed: Set<string>) {
  const s = S()
  const local = new Map(s.doc.elements.map((e) => [e.id, e]))
  // keep our own objects where nothing changed, so React doesn't redraw them
  const next = readStorage(storage).map((el) => (changed.has(el.id) ? el : (local.get(el.id) ?? el)))
  const meta = storage.meta.toJSON()
  s.applyRemote(next, meta.title, meta.updatedAt)
}

/** First connection: whichever side is newer wins (e.g. edits made offline). */
function reconcile(session: Session) {
  const storage = session.storage!
  const meta = storage.meta.toJSON()
  const local = S().doc
  const empty = storage.order.length === 0 && storage.elements.size === 0
  if ((empty && meta.updatedAt === 0) || local.updatedAt > meta.updatedAt) {
    session.room.history.disable(() => replaceAll(session, local.elements, local.title, local.updatedAt))
  } else {
    applyFromStorage(storage, new Set(storage.elements.keys()))
  }
}

function replaceAll(session: Session, elements: El[], title: string, updatedAt: number) {
  const st = session.storage!
  session.writing = true
  try {
    session.room.batch(() => {
      const ids = new Set(elements.map((e) => e.id))
      for (const key of [...st.elements.keys()]) if (!ids.has(key)) st.elements.delete(key)
      for (const el of elements) {
        if (JSON.stringify(st.elements.get(el.id)) !== JSON.stringify(el)) st.elements.set(el.id, el as unknown as Json)
      }
      st.order.clear()
      for (const el of elements) st.order.push(el.id)
      st.meta.update({ title, updatedAt })
    })
  } finally {
    session.writing = false
  }
}

/** Write the difference between two local states to the room. */
function write(session: Session, prev: El[], next: El[], title: string) {
  const st = session.storage
  if (!st) return
  session.writing = true
  try {
    session.room.batch(() => {
      const prevById = new Map(prev.map((e) => [e.id, e]))
      const nextIds = new Set<string>()
      for (const el of next) {
        nextIds.add(el.id)
        if (prevById.get(el.id) !== el) st.elements.set(el.id, el as unknown as Json)
      }
      for (const el of prev) {
        if (nextIds.has(el.id)) continue
        st.elements.delete(el.id)
        const i = st.order.indexOf(el.id)
        if (i >= 0) st.order.delete(i)
      }
      syncOrder(st.order, prev, next, prevById)
      const meta = st.meta.toJSON()
      if (meta.title !== title || prev !== next) st.meta.update({ title, updatedAt: Date.now() })
    })
  } finally {
    session.writing = false
  }
}

/**
 * Bring the shared z-order in line with ours, touching only what we changed:
 * new elements go right above their neighbour, reordered ones are moved.
 * Elements someone else just added (not known locally yet) are left alone.
 */
function syncOrder(order: LiveList<Lson>, prev: El[], next: El[], prevById: Map<string, El>) {
  for (let i = 0; i < next.length; i++) {
    const id = next[i].id
    if (prevById.has(id) || order.indexOf(id) >= 0) continue
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const k = order.indexOf(next[j].id)
      if (k >= 0) {
        at = k + 1
        break
      }
    }
    order.insert(id, at)
  }
  // did the relative order of existing elements change (bring to front, undo, …)?
  const nextIds = new Set(next.map((e) => e.id))
  const before = prev.filter((e) => nextIds.has(e.id)).map((e) => e.id)
  const after = next.filter((e) => prevById.has(e.id)).map((e) => e.id)
  if (before.every((id, i) => id === after[i])) return
  let last = -1
  for (const el of next) {
    const p = order.indexOf(el.id)
    if (p < 0) continue
    if (p < last) order.move(p, last)
    else last = p
  }
}

/** Remove a deleted board's live room for everyone. */
export async function deleteRoom(boardId: string) {
  if (!(await getConfig()).enabled) return
  await fetch(`api/collab?room=canvas-${boardId}`, { method: 'DELETE' }).catch(() => {})
}
