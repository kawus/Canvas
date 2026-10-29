import type { BoardDoc } from './types'

/**
 * Talks to the optional /api/board function (see api/board.ts). When the app
 * runs without it (local dev, a plain static host, or Vercel without a database)
 * every call reports 'disabled' and boards simply stay on this device.
 */

export type RemoteResult<T> = { ok: true; value: T } | { ok: false; reason: 'disabled' | 'offline' | 'too-large' | 'error' }

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
  // 503 = no database connected; non-JSON (e.g. index.html from a static host) = no function at all
  if (res.status === 503 || res.status === 404 || res.status === 405 || !isJson(res)) return { ok: false, reason: 'disabled' }
  return { ok: false, reason: 'error' }
}

/** value is null when the board doesn't exist in the cloud yet */
export async function fetchRemote(id: string): Promise<RemoteResult<BoardDoc | null>> {
  const res = await request(id)
  if (res !== 'offline' && res.status === 404 && isJson(res)) return { ok: true, value: null }
  if (res === 'offline' || !res.ok || !isJson(res)) return failure(res)
  try {
    const doc = (await res.json()) as BoardDoc
    if (!doc || !Array.isArray(doc.elements)) return { ok: false, reason: 'error' }
    return { ok: true, value: doc }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

const round = (_k: string, v: unknown) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)

export async function pushRemote(doc: BoardDoc): Promise<RemoteResult<number>> {
  const res = await request(doc.id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc, (k, v) => (k === 'createdAt' || k === 'updatedAt' ? v : round(k, v))),
  })
  if (res === 'offline' || !res.ok || !isJson(res)) return failure(res)
  return { ok: true, value: doc.updatedAt }
}

export async function deleteRemote(id: string) {
  await request(id, { method: 'DELETE' })
}
