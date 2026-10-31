import { createStore, del, get, set } from 'idb-keyval'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { customAlphabet } from 'nanoid'
import type { BoardDoc, BoardMeta, El } from './types'

/**
 * Boards live in this browser's IndexedDB, keyed by a short random id that is
 * also the URL hash (e.g. /#k3v9x2pq7d). No account needed; the link brings
 * you back to the board on this device. Share links carry a compressed
 * snapshot of the board in the URL itself, so they open anywhere.
 */

const store = typeof indexedDB !== 'undefined' ? createStore('canvas-boards', 'boards') : null
const memory = new Map<string, unknown>()

async function read<T>(key: string): Promise<T | undefined> {
  if (!store) return memory.get(key) as T | undefined
  try {
    return await get<T>(key, store)
  } catch {
    return memory.get(key) as T | undefined
  }
}

async function write(key: string, value: unknown) {
  memory.set(key, value)
  if (!store) return
  try {
    await set(key, value, store)
  } catch {
    /* storage unavailable (private mode / quota) – keep the in-memory copy */
  }
}

async function remove(key: string) {
  memory.delete(key)
  if (!store) return
  try {
    await del(key, store)
  } catch {
    /* ignore */
  }
}

export const newId = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 12)
export const newElementId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12)
export const newKey = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 20)

/** A new board you own (it gets its own edit key). */
export function emptyBoard(id = newId()): BoardDoc {
  const now = Date.now()
  return { id, title: 'Untitled', elements: [], createdAt: now, updatedAt: now, key: newKey() }
}

export async function listBoards(): Promise<BoardMeta[]> {
  const index = (await read<BoardMeta[]>('index')) ?? []
  return [...index].sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function loadBoard(id: string) {
  return read<BoardDoc>(`board:${id}`)
}

/** Told whenever the board list changes (the "My Canvas" backup listens). */
let indexListener: (() => void) | null = null
export function onIndexChange(fn: () => void) {
  indexListener = fn
}

export async function saveBoard(doc: BoardDoc) {
  await write(`board:${doc.id}`, doc)
  const index = (await read<BoardMeta[]>('index')) ?? []
  const meta: BoardMeta = { id: doc.id, title: doc.title, updatedAt: doc.updatedAt, count: doc.elements.length }
  if (doc.key) meta.key = doc.key
  const prev = index.find((m) => m.id === doc.id)
  // a board opened again after you removed it comes back to your list
  const removed = await removedBoards()
  if (removed[doc.id]) {
    delete removed[doc.id]
    await write('removed', removed)
    meta.seen = Date.now()
  } else if (prev?.seen) meta.seen = prev.seen
  const next = index.filter((m) => m.id !== doc.id)
  next.push(meta)
  await write('index', next)
  if (!prev || prev.title !== meta.title || prev.key !== meta.key || prev.updatedAt !== meta.updatedAt || prev.seen !== meta.seen)
    indexListener?.()
}

export async function deleteBoard(id: string) {
  await remove(`board:${id}`)
  const index = (await read<BoardMeta[]>('index')) ?? []
  await write(
    'index',
    index.filter((m) => m.id !== id),
  )
  // remember the removal so other devices drop it from their lists too
  const removed = (await read<Record<string, number>>('removed')) ?? {}
  removed[id] = Date.now()
  await write('removed', removed)
  indexListener?.()
}

/** Boards saved before the list kept edit keys: copy each key into the list (once). */
export async function fillIndexKeys() {
  const index = (await read<BoardMeta[]>('index')) ?? []
  let filled = false
  for (const meta of index) {
    if (meta.key) continue
    const key = (await loadBoard(meta.id))?.key
    if (key) {
      meta.key = key
      filled = true
    }
  }
  if (filled) await write('index', index)
}

export async function removedBoards() {
  return (await read<Record<string, number>>('removed')) ?? {}
}

/** Small key/value settings kept with the boards (e.g. the "My Canvas" link). */
export const getLocal = read
export const setLocal = write

export async function lastBoardId() {
  return read<string>('last')
}

export async function setLastBoardId(id: string) {
  await write('last', id)
}

/* ---------- Share links ---------- */

interface SharePayload {
  v: 1
  id: string
  t: string
  e: El[]
}

const round = (_k: string, v: unknown) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)

export function encodeShare(doc: BoardDoc) {
  const payload: SharePayload = { v: 1, id: doc.id, t: doc.title, e: doc.elements }
  return compressToEncodedURIComponent(JSON.stringify(payload, round))
}

export function decodeShare(data: string): { id: string; title: string; elements: El[] } | null {
  try {
    const json = decompressFromEncodedURIComponent(data)
    if (!json) return null
    const p = JSON.parse(json) as SharePayload
    if (p.v !== 1 || !Array.isArray(p.e)) return null
    return { id: String(p.id || newId()), title: String(p.t || 'Untitled'), elements: p.e.filter(isElement) }
  } catch {
    return null
  }
}

function isElement(e: unknown): e is El {
  if (!e || typeof e !== 'object') return false
  const t = (e as El).type
  return ['freedraw', 'rect', 'ellipse', 'line', 'arrow', 'text', 'sticky', 'image', 'link', 'swatch'].includes(t) && typeof (e as El).id === 'string'
}

export function shareUrl(doc: BoardDoc) {
  return `${location.origin}${location.pathname}#share=${encodeShare(doc)}`
}

/**
 * A board's link: /b/<id> (view), with the edit key after a # for owner and
 * edit links (/b/<id>#<key>). The /b/ path lets messaging apps show the
 * board's name in link previews (api/share.js); the key never reaches the server.
 */
export function boardUrl(id: string, key?: string) {
  return `${location.origin}${location.pathname}b/${id}${key ? `#${key}` : ''}`
}
