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

const S = () => useStore.getState()

/** Whether the current board has been written to storage at least once. */
let persisted = false
let saveTimer: ReturnType<typeof setTimeout> | undefined

function vpKey(id: string) {
  return `canvas-vp:${id}`
}

function restoreViewport(doc: BoardDoc) {
  try {
    const raw = localStorage.getItem(vpKey(doc.id))
    if (raw) {
      const v = JSON.parse(raw) as Viewport
      if (Number.isFinite(v.x) && Number.isFinite(v.y) && v.zoom > 0) {
        S().setViewport(v)
        return
      }
    }
  } catch {
    /* ignore */
  }
  if (doc.elements.length) S().zoomToFit()
  else S().setViewport({ x: window.innerWidth / 2, y: window.innerHeight / 2.4, zoom: 1 })
}

function setHash(id: string, push: boolean) {
  const url = `${location.pathname}${location.search}#${id}`
  if (push) history.pushState(null, '', url)
  else history.replaceState(null, '', url)
}

function show(doc: BoardDoc, isPersisted: boolean) {
  persisted = isPersisted
  S().setDoc(doc)
  restoreViewport(doc)
  document.title = doc.title && doc.title !== 'Untitled' ? `${doc.title} — Canvas` : 'Canvas'
  void setLastBoardId(doc.id)
}

export async function flushSave() {
  clearTimeout(saveTimer)
  saveTimer = undefined
  const { doc, loaded } = S()
  if (!loaded) return
  // Don't litter the board list with untouched, empty boards.
  if (!persisted && doc.elements.length === 0 && doc.title === 'Untitled') return
  persisted = true
  await saveBoard(doc)
}

export async function openBoard(id: string, push = false, saveCurrent = true) {
  if (saveCurrent) await flushSave()
  const stored = await loadBoard(id)
  setHash(id, push)
  if (stored) show(stored, true)
  else show(emptyBoard(id), false)
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
  show(copy, true)
  S().showToast('Board duplicated')
}

export async function removeCurrentBoard() {
  const { doc } = S()
  clearTimeout(saveTimer)
  persisted = false
  await deleteBoard(doc.id)
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
  const existing = await loadBoard(shared.id)
  const now = Date.now()
  const doc: BoardDoc = {
    id: existing ? newId() : shared.id,
    title: existing ? `${shared.title} (copy)` : shared.title,
    elements: shared.elements,
    createdAt: now,
    updatedAt: now,
  }
  await saveBoard(doc)
  setHash(doc.id, false)
  show(doc, true)
  S().zoomToFit()
  S().showToast('Opened a shared board — it’s now saved here too')
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
    const stored = await loadBoard(hash)
    await openBoard(hash)
    if (!stored) S().showToast('This board isn’t saved in this browser yet — it starts empty')
    return
  }
  const last = await lastBoardId()
  const lastDoc = last ? await loadBoard(last) : undefined
  if (lastDoc) await openBoard(lastDoc.id)
  else await openBoard(newId())
}

export function startPersistence() {
  let vpTimer: ReturnType<typeof setTimeout> | undefined
  const unsub = useStore.subscribe((s, p) => {
    if (s.doc !== p.doc && s.loaded && p.loaded && s.doc.id === p.doc.id) {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => void flushSave(), 400)
      if (s.doc.title !== p.doc.title) {
        document.title = s.doc.title && s.doc.title !== 'Untitled' ? `${s.doc.title} — Canvas` : 'Canvas'
      }
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
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flushSave()
  }
  const onHash = () => void routeFromHash()
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', onHide)
  window.addEventListener('hashchange', onHash)
  return () => {
    unsub()
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', onHide)
    window.removeEventListener('hashchange', onHash)
  }
}
