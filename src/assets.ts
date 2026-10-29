import { createStore, get, set } from 'idb-keyval'
import { useEffect, useState } from 'react'

/**
 * Image data lives apart from boards, keyed by a content hash: on the device
 * (IndexedDB) and, when cloud storage is on, in the cloud (api/asset.js).
 * Boards only carry the hash, so they stay small and quick to sync.
 */

const store = typeof indexedDB !== 'undefined' ? createStore('canvas-assets', 'assets') : null
const memory = new Map<string, string>()
const inflight = new Map<string, Promise<string | undefined>>()
const listeners = new Map<string, Set<(url: string) => void>>()
const uploaded = new Set<string>()

async function idbGet<T>(key: string) {
  if (!store) return undefined
  try {
    return await get<T>(key, store)
  } catch {
    return undefined
  }
}

async function idbSet(key: string, value: unknown) {
  if (!store) return
  try {
    await set(key, value, store)
  } catch {
    /* quota or private mode: keep it in memory */
  }
}

export async function hashData(data: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24)
}

function publish(hash: string, url: string) {
  memory.set(hash, url)
  listeners.get(hash)?.forEach((fn) => fn(url))
}

export async function saveAsset(hash: string, url: string) {
  publish(hash, url)
  await idbSet(`a:${hash}`, url)
}

export function peekAsset(hash: string) {
  return memory.get(hash)
}

/** Device first, then the cloud. Resolves undefined if the image can't be found. */
export function loadAsset(hash: string): Promise<string | undefined> {
  const hit = memory.get(hash)
  if (hit) return Promise.resolve(hit)
  let p = inflight.get(hash)
  if (p) return p
  p = (async () => {
    const local = await idbGet<string>(`a:${hash}`)
    if (local) {
      publish(hash, local)
      return local
    }
    try {
      const res = await fetch(`api/asset?id=${hash}`)
      const text = res.ok ? await res.text() : ''
      if (text.startsWith('data:image/')) {
        uploaded.add(hash)
        await saveAsset(hash, text)
        return text
      }
    } catch {
      /* offline */
    }
    return undefined
  })()
  inflight.set(hash, p)
  void p.finally(() => inflight.delete(hash))
  return p
}

export function useAsset(hash: string) {
  const [url, setUrl] = useState(() => memory.get(hash))
  useEffect(() => {
    const fn = (u: string) => setUrl(u)
    let subs = listeners.get(hash)
    if (!subs) listeners.set(hash, (subs = new Set()))
    subs.add(fn)
    if (!memory.has(hash)) void loadAsset(hash)
    else fn(memory.get(hash)!)
    return () => {
      subs.delete(fn)
    }
  }, [hash])
  return url
}

/** Upload images the cloud doesn't have yet. Returns false if any upload failed. */
export async function uploadAssets(hashes: string[]) {
  let ok = true
  for (const hash of new Set(hashes)) {
    if (uploaded.has(hash) || (await idbGet(`u:${hash}`))) {
      uploaded.add(hash)
      continue
    }
    const data = await loadAsset(hash)
    if (!data) continue
    try {
      const res = await fetch(`api/asset?id=${hash}`, { method: 'PUT', body: data, headers: { 'Content-Type': 'text/plain' } })
      if (res.ok) {
        uploaded.add(hash)
        await idbSet(`u:${hash}`, 1)
      } else ok = false
    } catch {
      ok = false
    }
  }
  return ok
}
