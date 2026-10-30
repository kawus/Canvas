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

export async function saveBoard(doc: BoardDoc) {
  await write(`board:${doc.id}`, doc)
  const index = (await read<BoardMeta[]>('index')) ?? []
  const meta: BoardMeta = { id: doc.id, title: doc.title, updatedAt: doc.updatedAt, count: doc.elements.length }
  const next = index.filter((m) => m.id !== doc.id)
  next.push(meta)
  await write('index', next)
}

export async function deleteBoard(id: string) {
  await remove(`board:${id}`)
  const index = (await read<BoardMeta[]>('index')) ?? []
  await write(
    'index',
    index.filter((m) => m.id !== id),
  )
}

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

/** View link (`#id`), or edit / owner link when the key is included (`#id.key`). */
export function boardUrl(id: string, key?: string) {
  return `${location.origin}${location.pathname}#${id}${key ? `.${key}` : ''}`
}
