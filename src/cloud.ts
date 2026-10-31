import { proToken } from './pro'
import type { BoardDoc } from './types'

/**
 * Talks to the optional /api/board function (see api/board.ts). When the app
 * runs without it (local dev, a plain static host, or Vercel without a database)
 * every call reports 'disabled' and boards simply stay on this device.
 */

export type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'disabled' | 'offline' | 'too-large' | 'forbidden' | 'error' }

const endpoint = (id: string) => `api/board?id=${encodeURIComponent(id)}`

function isJson(res: Response) {
  return (res.headers.get('content-type') || '').includes('application/json')
}

async function request(id: string, init?: RequestInit): Promise<Response | 'offline'> {
  try {
    return await fetch(endpoint(id), { cache: 'no-store', ...init })
  } catch {
    return 'offline'
  }
}

function failure(res: Response | 'offline'): RemoteResult<never> {
  if (res === 'offline') return { ok: false, reason: 'offline' }
  if (res.status === 413) return { ok: false, reason: 'too-large' }
  if (res.status === 403 && isJson(res)) return { ok: false, reason: 'forbidden' }
  // 503 = no database connected; non-JSON (e.g. index.html from a static host) = no function at all
  if (res.status === 503 || res.status === 404 || res.status === 405 || !isJson(res)) return { ok: false, reason: 'disabled' }
  return { ok: false, reason: 'error' }
}

/** value is null when the board doesn't exist in the cloud yet */
export async function fetchRemote(id: string): Promise<RemoteResult<BoardDoc | null>> {
  return parseBoard(await request(id))
}

/** Only downloads the board if it changed after `since` (value 'unchanged' otherwise). */
export async function fetchIfNewer(id: string, since: number): Promise<RemoteResult<BoardDoc | null | 'unchanged'>> {
  let res: Response | 'offline'
  try {
    res = await fetch(`${endpoint(id)}&since=${since}`, { cache: 'no-store' })
  } catch {
    res = 'offline'
  }
  return parseBoard(res, true)
}

async function parseBoard(res: Response | 'offline'): Promise<RemoteResult<BoardDoc | null>>
async function parseBoard(res: Response | 'offline', allowUnchanged: true): Promise<RemoteResult<BoardDoc | null | 'unchanged'>>
async function parseBoard(res: Response | 'offline', allowUnchanged = false): Promise<RemoteResult<BoardDoc | null | 'unchanged'>> {
  if (res !== 'offline' && res.status === 404 && isJson(res)) return { ok: true, value: null }
  if (res === 'offline' || !res.ok || !isJson(res)) return failure(res)
  try {
    const doc = (await res.json()) as BoardDoc & { unchanged?: boolean }
    if (allowUnchanged && doc?.unchanged) return { ok: true, value: 'unchanged' }
    if (!doc || !Array.isArray(doc.elements)) return { ok: false, reason: 'error' }
    return { ok: true, value: doc }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

const round = (_k: string, v: unknown) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)

/** Saves the board's link-preview picture (editors only). */
export async function pushPreview(id: string, key: string, dataUrl: string) {
  try {
    const res = await fetch(`api/preview?id=${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'X-Edit-Key': key }, body: dataUrl })
    return res.ok
  } catch {
    return false
  }
}

/** Saves the board; the value says whether live editing on it is paid for by a Pro owner. */
export async function pushRemote(doc: BoardDoc): Promise<RemoteResult<boolean>> {
  // the edit key travels in a header and is never stored with the board
  const { key, pro: _pro, ...body } = doc
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Edit-Key': key ?? '' }
  const token = proToken()
  if (token && doc.shared) headers['X-Pro-Token'] = token
  const res = await request(doc.id, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body, (k, v) => (k === 'createdAt' || k === 'updatedAt' ? v : round(k, v))),
  })
  if (res === 'offline' || !res.ok || !isJson(res)) return failure(res)
  try {
    return { ok: true, value: !!((await res.json()) as { pro?: boolean }).pro }
  } catch {
    return { ok: true, value: false }
  }
}

export async function deleteRemote(id: string, key: string) {
  await request(id, { method: 'DELETE', headers: { 'X-Edit-Key': key } })
}
