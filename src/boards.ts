import { deleteRemote, fetchRemote, pushRemote, type RemoteResult } from './cloud'
import { useStore } from './store'
import {
  decodeShare,
  deleteBoard,
  emptyBoard,
  lastBoardId,
  listBoards,
  loadBoard,
  newId,
  saveBoard,
  setLastBoardId,
} from './storage'
import type { BoardDoc, Viewport } from './types'

/**
 * Boards are saved on the device first (instant, works offline) and then, when
 * the /api/board function and its database are available, pushed to the cloud
 * so the board's own link opens it on any device.
 */

const S = () => useStore.getState()

/** Whether the current board has been written to storage at least once. */
let persisted = false
let saveTimer: ReturnType<typeof setTimeout> | undefined

function vpKey(id: string) {
  return `canvas-vp:${id}`
}

function savedViewport(id: string): Viewport | null {
  try {
    const raw = localStorage.getItem(vpKey(id))
    if (raw) {
      const v = JSON.parse(raw) as Viewport
      if (Number.isFinite(v.x) && Number.isFinite(v.y) && v.zoom > 0) return v
    }
  } catch {
    /* ignore */
  }
  return null
}

function restoreViewport(doc: BoardDoc) {
  const v = savedViewport(doc.id)
  if (v) S().setViewport(v)
  else if (doc.elements.length) S().zoomToFit()
  else S().setViewport({ x: window.innerWidth / 2, y: window.innerHeight / 2.4, zoom: 1 })
}

function setHash(id: string, push: boolean) {
  const url = `${location.pathname}${location.search}#${id}`
  if (push) history.pushState(null, '', url)
  else history.replaceState(null, '', url)
}

function setTitle(doc: BoardDoc) {
  document.title = doc.title && doc.title !== 'Untitled' ? `${doc.title} — Canvas` : 'Canvas'
}

function show(doc: BoardDoc, isPersisted: boolean, keepViewport = false) {
  persisted = isPersisted
  const viewport = S().viewport
  S().setDoc(doc)
  if (keepViewport) S().setViewport(viewport)
  else restoreViewport(doc)
  setTitle(doc)
  void setLastBoardId(doc.id)
}

/* ---------- Cloud sync ---------- */

let pushing = false
let queued: BoardDoc | null = null
/** The last document version known to be in the cloud. */
let lastSynced: BoardDoc | null = null

function noteRemote<T>(r: RemoteResult<T>) {
  const s = S()
  if (r.ok) {
    s.setCloud(true)
    return
  }
  if (r.reason === 'disabled') {
    s.setCloud(false)
    s.setSync('idle')
  } else if (s.cloud) {
    s.setSync(r.reason === 'offline' ? 'offline' : r.reason === 'too-large' ? 'too-large' : 'error')
  }
}

async function push(doc: BoardDoc) {
  if (S().cloud === false) return
  if (pushing) {
    queued = doc
    return
  }
  pushing = true
  if (S().cloud) S().setSync('saving')
  const r = await pushRemote(doc)
  pushing = false
  noteRemote(r)
  if (r.ok) {
    if (S().doc.id === doc.id) lastSynced = doc
    if (!queued && S().doc === doc) S().setSync('saved')
  }
  if (queued) {
    const next = queued
    queued = null
    void push(next)
  }
}

function hasUnsyncedChanges() {
  return persisted && S().doc !== lastSynced
}

/** Pull a newer version of the open board from the cloud (e.g. edited on another device). */
async function pullIfNewer() {
  const s = S()
  if (!s.cloud || !s.loaded || hasUnsyncedChanges() || pushing) return
  const before = s.doc
  const r = await fetchRemote(before.id)
  noteRemote(r)
  if (!r.ok || !r.value) return
  // only replace if nothing changed locally while we were fetching
  if (S().doc !== before || r.value.updatedAt <= before.updatedAt) return
  await saveBoard(r.value)
  show(r.value, true, true)
  lastSynced = S().doc
  S().setSync('saved')
}

/* ---------- Saving ---------- */

export async function flushSave() {
  clearTimeout(saveTimer)
  saveTimer = undefined
  const { doc, loaded } = S()
  if (!loaded) return
  // Don't litter the board list (or the cloud) with untouched, empty boards.
  if (!persisted && doc.elements.length === 0 && doc.title === 'Untitled') return
  persisted = true
  await saveBoard(doc)
  if (doc !== lastSynced) void push(doc)
}

/* ---------- Opening boards ---------- */

/** Returns false when the board exists neither on this device nor in the cloud. */
export async function openBoard(id: string, pushHistory = false, saveCurrent = true): Promise<boolean> {
  if (saveCurrent) await flushSave()
  const local = await loadBoard(id)
  setHash(id, pushHistory)
  lastSynced = null
  const shown = local ?? emptyBoard(id)
  show(shown, !!local)
  if (S().cloud === false) return !!local

  if (S().cloud) S().setSync('loading')
  const r = await fetchRemote(id)
  noteRemote(r)
  if (!r.ok) return !!local
  const current = S().doc
  if (current.id !== id) return true // user moved on to another board

  const remote = r.value
  if (remote && (!local || remote.updatedAt > local.updatedAt)) {
    if (current === shown) {
      await saveBoard(remote)
      show(remote, true, !!local && !!savedViewport(id))
      lastSynced = S().doc
      S().setSync('saved')
    }
    return true
  }
  if (remote && local && remote.updatedAt === local.updatedAt) {
    lastSynced = current === shown ? current : null
    S().setSync(current === shown ? 'saved' : 'saving')
    return true
  }
  // The device copy is newer (or the board was never uploaded): upload it.
  if (local && (local.elements.length || local.title !== 'Untitled')) void push(S().doc)
  else S().setSync('saved')
  return !!local || !!remote
}

export async function newBoard() {
  await openBoard(newId(), true)
}

export async function duplicateBoard() {
  await flushSave()
  const { doc } = S()
  const copy: BoardDoc = {
    ...doc,
    id: newId(),
    title: `${doc.title} (copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await saveBoard(copy)
  setHash(copy.id, true)
  lastSynced = null
  show(copy, true)
  void push(copy)
  S().showToast('Board duplicated')
}

export async function removeCurrentBoard() {
  const { doc, cloud } = S()
  clearTimeout(saveTimer)
  persisted = false
  await deleteBoard(doc.id)
  if (cloud) await deleteRemote(doc.id)
  try {
    localStorage.removeItem(vpKey(doc.id))
  } catch {
    /* ignore */
  }
  const rest = await listBoards()
  if (rest.length) await openBoard(rest[0].id, false, false)
  else await openBoard(newId(), false, false)
  S().showToast('Board deleted')
}

async function importShare(data: string) {
  const shared = decodeShare(data)
  if (!shared) {
    S().showToast('That share link looks broken')
    return false
  }
  // A snapshot always becomes a fresh board, so it never overwrites the original.
  const now = Date.now()
  const doc: BoardDoc = {
    id: newId(),
    title: shared.title,
    elements: shared.elements,
    createdAt: now,
    updatedAt: now,
  }
  await saveBoard(doc)
  setHash(doc.id, false)
  lastSynced = null
  show(doc, true)
  S().zoomToFit()
  void push(doc)
  S().showToast('Opened a copy of a shared board')
  return true
}

let routing: Promise<void> = Promise.resolve()

/** Decide what to show based on the URL hash. Calls are serialized. */
export function routeFromHash() {
  routing = routing.then(route, route)
  return routing
}

async function route() {
  const hash = decodeURIComponent(location.hash.slice(1))
  if (hash.startsWith('share=')) {
    if (await importShare(hash.slice(6))) return
  } else if (/^[a-z0-9]{4,32}$/i.test(hash)) {
    if (hash === S().doc.id && S().loaded) return
    const found = await openBoard(hash)
    if (!found && S().doc.id === hash) {
      S().showToast(
        S().cloud ? 'This board doesn’t exist yet — it starts empty' : 'This board isn’t saved in this browser — it starts empty',
      )
    }
    return
  }
  const last = await lastBoardId()
  const lastDoc = last ? await loadBoard(last) : undefined
  if (lastDoc) await openBoard(lastDoc.id)
  else await openBoard(newId())
}

/** Make sure the latest version is saved and uploaded (e.g. before copying a live link). */
export async function syncNow() {
  await flushSave()
}

export function startPersistence() {
  let vpTimer: ReturnType<typeof setTimeout> | undefined
  const unsub = useStore.subscribe((s, p) => {
    if (s.doc !== p.doc && s.loaded && p.loaded && s.doc.id === p.doc.id) {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => void flushSave(), 500)
      if (s.cloud && persisted) s.setSync('saving')
      if (s.doc.title !== p.doc.title) setTitle(s.doc)
    }
    if (s.viewport !== p.viewport && s.loaded) {
      clearTimeout(vpTimer)
      vpTimer = setTimeout(() => {
        try {
          localStorage.setItem(vpKey(s.doc.id), JSON.stringify(s.viewport))
        } catch {
          /* ignore */
        }
      }, 300)
    }
  })
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void flushSave()
    else void pullIfNewer()
  }
  const onFocus = () => void pullIfNewer()
  const onOnline = () => {
    if (hasUnsyncedChanges()) void flushSave()
  }
  const onHash = () => void routeFromHash()
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onVisibility)
  window.addEventListener('focus', onFocus)
  window.addEventListener('online', onOnline)
  window.addEventListener('hashchange', onHash)
  return () => {
    unsub()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onVisibility)
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('hashchange', onHash)
  }
}
