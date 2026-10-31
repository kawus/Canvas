import { uploadAssets } from './assets'
import { deleteRemote, fetchIfNewer, fetchRemote, pushRemote, type RemoteResult } from './cloud'
import { deleteRoom, isLive, startCollab, stopCollab } from './collab'
import { adoptLibrary, allBoards, forgetKey, inSafariTab, keyFor, myCanvasIn, onLibraryChange } from './library'
import { activateProLink } from './pro'
import { useStore } from './store'
import { countCheck } from './usage'
import {
  decodeShare,
  deleteBoard,
  emptyBoard,
  lastBoardId,
  listBoards,
  loadBoard,
  newId,
  newKey,
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
  // only the owner and invited editors (who hold the edit key) can save
  if (S().cloud === false || !doc.key) return
  if (pushing) {
    queued = doc
    return
  }
  pushing = true
  if (S().cloud) S().setSync('saving')
  // images are stored separately; make sure the cloud has them before the board points at them
  const images = doc.elements.flatMap((e) =>
    e.type === 'image' ? [e.asset, ...(e.src ? [e.src] : [])] : e.type === 'link' && e.image ? [e.image] : [],
  )
  if (images.length && S().cloud !== false) await uploadAssets(images)
  const r = await pushRemote(doc)
  pushing = false
  noteRemote(r)
  if (r.ok) {
    if (S().doc.id === doc.id) {
      lastSynced = doc
      S().setDocPro(r.value)
    }
    if (!queued && S().doc === doc) S().setSync('saved')
  } else if (r.reason === 'forbidden' && S().doc.id === doc.id) {
    // the board is owned by someone else: this device can only view it
    S().dropKey()
    forgetKey(doc.id)
    S().setSync('idle')
    await saveBoard(S().doc)
    S().showToast('This board is view-only here — make a copy to edit it')
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
async function pullIfNewer(quick = false) {
  const s = S()
  // while collaborating live, the room keeps everyone in sync; and never mid-edit
  if (!s.cloud || !s.loaded || hasUnsyncedChanges() || pushing || isLive()) return
  if (s.editingId || s.cropId || s.draft) return
  const before = s.doc
  const r = quick ? await fetchIfNewer(before.id, before.updatedAt) : await fetchRemote(before.id)
  noteRemote(r)
  if (quick && r.ok) countCheck(r.value !== 'unchanged')
  if (!r.ok || !r.value || r.value === 'unchanged') return
  // only replace if nothing changed locally while we were fetching
  const now = S()
  if (now.doc !== before || now.editingId || now.cropId || now.draft) return
  now.setDocPro(!!r.value.pro)
  if (r.value.updatedAt <= before.updatedAt) return
  // changes from your other device: applied in place, keeping your selection, view and undo
  now.applyRemote(r.value.elements, r.value.title, r.value.updatedAt)
  lastSynced = S().doc
  await saveBoard(S().doc)
  setTitle(S().doc)
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

function withKey(doc: BoardDoc, key: string | undefined): BoardDoc {
  const out = { ...doc }
  if (key) out.key = key
  else delete out.key
  return out
}

interface OpenOptions {
  /** add a browser history entry */
  push?: boolean
  /** save the current board first */
  save?: boolean
  /** edit key from an owner / edit link */
  key?: string
  /** a brand-new board of your own */
  fresh?: boolean
}

/** Returns false when the board exists neither on this device nor in the cloud. */
export async function openBoard(id: string, opts: OpenOptions = {}): Promise<boolean> {
  if (opts.save !== false) await flushSave()
  let local = await loadBoard(id)
  // a board you own on another device: My Canvas knows its edit key
  if (!opts.key && !local?.key) opts = { ...opts, key: keyFor(id) }
  if (local && opts.key && local.key !== opts.key) {
    // an edit link gives this device edit rights
    local = withKey(local, opts.key)
    await saveBoard(local)
  }
  setHash(id, !!opts.push)
  lastSynced = null
  const shown = local ?? (opts.fresh ? emptyBoard(id) : withKey(emptyBoard(id), opts.key))
  show(shown, !!local)
  // Boards that live only on this device are always yours
  const ownIfLocalOnly = () => {
    if (S().cloud === false && S().doc.id === id && !S().doc.key) S().setKey(newKey())
  }
  if (S().cloud === false) {
    ownIfLocalOnly()
    return !!local
  }

  if (S().cloud) S().setSync('loading')
  const r = await fetchRemote(id)
  noteRemote(r)
  if (!r.ok) {
    ownIfLocalOnly()
    if (S().sync === 'loading') S().setSync('idle')
    return !!local
  }
  const current = S().doc
  if (current.id !== id) return true // user moved on to another board

  const remote = r.value
  if (!remote && !local) {
    // a board that doesn't exist anywhere yet: it's a new board of yours
    if (!current.key) S().setKey(newKey())
    S().setSync('saved')
    return false
  }
  if (remote) S().setDocPro(!!remote.pro)
  if (remote && (!local || remote.updatedAt > local.updatedAt)) {
    if (current === shown || S().doc.elements === shown.elements) {
      const merged = withKey({ ...remote, pro: !!remote.pro }, S().doc.key)
      await saveBoard(merged)
      show(merged, true, !!local && !!savedViewport(id))
      lastSynced = S().doc
      S().setSync(merged.key ? 'saved' : 'idle')
    }
    return true
  }
  if (remote && local && remote.updatedAt === local.updatedAt) {
    lastSynced = S().doc.elements === shown.elements ? S().doc : null
    S().setSync(lastSynced ? 'saved' : 'saving')
    return true
  }
  // The device copy is newer (or the board was never uploaded): upload it.
  if (local && (local.elements.length || local.title !== 'Untitled')) void push(S().doc)
  else S().setSync('saved')
  return !!local || !!remote
}

export async function newBoard() {
  await openBoard(newId(), { push: true, fresh: true })
}

export async function duplicateBoard() {
  await flushSave()
  const { doc } = S()
  // a copy is always your own board: new id, new key, not shared
  const copy: BoardDoc = {
    id: newId(),
    title: `${doc.title} (copy)`,
    elements: doc.elements,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    key: newKey(),
  }
  await saveBoard(copy)
  setHash(copy.id, true)
  lastSynced = null
  show(copy, true)
  void push(copy)
  S().showToast(doc.key ? 'Board duplicated' : 'This copy is yours to edit')
}

export async function removeCurrentBoard() {
  const { doc, cloud } = S()
  clearTimeout(saveTimer)
  persisted = false
  stopCollab()
  await deleteBoard(doc.id)
  // only the owner deletes the board itself; a viewer just removes it from their list
  if (doc.key) {
    if (doc.shared) await deleteRoom(doc.id, doc.key)
    if (cloud) await deleteRemote(doc.id, doc.key)
  }
  try {
    localStorage.removeItem(vpKey(doc.id))
  } catch {
    /* ignore */
  }
  const rest = await listBoards()
  if (rest.length) await openBoard(rest[0].id, { save: false })
  else await openBoard(newId(), { save: false, fresh: true })
  S().showToast(doc.key ? 'Board deleted' : 'Removed from your boards')
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
    key: newKey(),
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

/** Boards saved before edit keys existed were made on this device: they're yours. */
async function migrateKeys() {
  try {
    if (localStorage.getItem('canvas-keys-v1')) return
  } catch {
    return
  }
  for (const meta of await listBoards()) {
    const doc = await loadBoard(meta.id)
    if (doc && !doc.key) await saveBoard({ ...doc, key: newKey() })
  }
  try {
    localStorage.setItem('canvas-keys-v1', '1')
  } catch {
    /* ignore */
  }
}

async function route() {
  await migrateKeys()
  let hash = decodeURIComponent(location.hash.slice(1))
  // the smoke-test results page isn't a board
  if (hash === 'stats') return
  if (hash.startsWith('pro=')) {
    await activateProLink(hash.slice(4))
    hash = ''
  }
  if (hash.startsWith('me=')) {
    await openMyCanvas(hash.slice(3))
    return
  }
  if (hash.startsWith('share=')) {
    if (await importShare(hash.slice(6))) return
  } else {
    // #id = view link, #id.key = owner / edit link
    const m = /^([a-z0-9]{4,32})(?:\.([a-z0-9]{16,64}))?$/i.exec(hash)
    if (m) {
      const [, id, key] = m
      if (id === S().doc.id && S().loaded && (!key || key === S().doc.key)) return
      const found = await openBoard(id, { key })
      if (!found && S().doc.id === id && !S().cloud) {
        S().showToast('This board isn’t saved in this browser — it starts empty')
      }
      return
    }
  }
  const last = await lastBoardId()
  const lastDoc = last ? await loadBoard(last) : undefined
  if (lastDoc) await openBoard(lastDoc.id)
  else await openBoard(newId(), { fresh: true })
}

/** Opening a My Canvas link: bring in its boards, open the latest one and show the list. */
async function openMyCanvas(link: string, fromUrl = true) {
  const result = await adoptLibrary(link)
  if (result === 'invalid') S().showToast('That My Canvas link looks broken')
  const [latest] = await allBoards()
  if (latest) await openBoard(latest.id, { push: !fromUrl })
  else await openBoard(newId(), { fresh: true })
  if (result === 'invalid') return
  S().showToast(result === 'same' ? 'This is your Canvas' : 'Welcome back — your boards are here')
  // in a Safari tab, also explain how to bring the boards into the Home Screen app
  S().setPanel(fromUrl && inSafariTab() ? 'welcome' : 'boards')
}

/** A My Canvas link pasted into the app (e.g. the Home Screen app, which links can't open). */
export async function connectMyCanvas(text: string) {
  const link = myCanvasIn(text)
  if (!link) return false
  routing = routing.then(() => openMyCanvas(link, false))
  await routing
  return true
}

/** Make sure the latest version is saved and uploaded (e.g. before copying a live link). */
export async function syncNow() {
  await flushSave()
}

export function startPersistence() {
  let vpTimer: ReturnType<typeof setTimeout> | undefined
  const unsub = useStore.subscribe((s, p) => {
    // Live collaboration follows the open board, once it has been shared and cloud saving works
    // Live collaboration: editors of a shared board, when its owner has Pro (or there's no paywall)
    const canLive = (x: typeof s) =>
      x.loaded && !!x.doc.key && !!x.doc.shared && x.cloud === true && (!!x.doc.pro || x.pro.paywall === false)
    const live = canLive(s)
    const wasLive = canLive(p)
    if (s.doc.id !== p.doc.id || live !== wasLive) {
      if (live) void startCollab(s.doc.id)
      else stopCollab()
    }
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
  // How often an open board looks for changes made elsewhere: every 10 s while
  // something is happening (you're working on it, or it just changed), easing off
  // to every 30 s and then once a minute when the board has been quiet.
  let lastPoke = Date.now()
  let lastCheck = Date.now()
  const poke = () => (lastPoke = Date.now())
  const checkEvery = () => {
    const quiet = Date.now() - Math.max(lastPoke, S().doc.updatedAt)
    return quiet < 2 * 60_000 ? 10_000 : quiet < 10 * 60_000 ? 30_000 : 60_000
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void flushSave()
    else {
      poke()
      void pullIfNewer()
    }
  }
  const onFocus = () => void pullIfNewer()
  // viewers have no live connection: check for the owner's changes now and then
  // pick up changes made on your other devices (or by the owner, for viewers) while a board is open
  const poll = setInterval(() => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < checkEvery()) return
    lastCheck = Date.now()
    void pullIfNewer(true)
  }, 2_000)
  const onOnline = () => {
    if (hasUnsyncedChanges()) void flushSave()
  }
  const onHash = () => void routeFromHash()
  window.addEventListener('pointerdown', poke, true)
  window.addEventListener('keydown', poke, true)
  window.addEventListener('wheel', poke, { capture: true, passive: true })
  // the open board turned out to be yours (My Canvas knows its edit key from another device)
  const offLibrary = onLibraryChange(() => {
    const s = S()
    const key = s.loaded && !s.doc.key ? keyFor(s.doc.id) : undefined
    if (!key) return
    s.setKey(key)
    s.setTool('select')
  })
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onVisibility)
  window.addEventListener('focus', onFocus)
  window.addEventListener('online', onOnline)
  window.addEventListener('hashchange', onHash)
  return () => {
    clearInterval(poll)
    unsub()
    offLibrary()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onVisibility)
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('hashchange', onHash)
    window.removeEventListener('pointerdown', poke, true)
    window.removeEventListener('keydown', poke, true)
    window.removeEventListener('wheel', poke, true)
  }
}
