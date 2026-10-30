import { customAlphabet } from 'nanoid'
import { onProTokenChange, proToken, refreshPro, saveToken } from './pro'
import { fillIndexKeys, getLocal, listBoards, onIndexChange, removedBoards, setLocal } from './storage'

/**
 * "My Canvas": a private link that brings all your boards back, on any device,
 * without an account. This browser keeps a list of your boards (with their edit
 * keys) and your Pro pass; the list is encrypted here with a secret that only
 * lives in your link, then backed up to /api/library. The server can't read it.
 */

export interface LibEntry {
  id: string
  title: string
  updatedAt: number
  count?: number
  /** edit key: you own (or were invited to edit) this board */
  key?: string
  /** when it was deleted / removed from your boards */
  removed?: number
  /** when it was opened again after that */
  seen?: number
}

export interface BoardRow extends LibEntry {
  /** a copy of the board is saved in this browser */
  here: boolean
}

interface LibIdentity {
  id: string
  secret: string
}

interface Payload {
  v: 1
  entries: LibEntry[]
  pro?: string
}

const newLibId = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 12)
const newSecret = customAlphabet('23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', 24)
const LINK_RE = /^([a-z0-9]{10,32})\.([A-Za-z0-9]{16,64})$/

let identity: LibIdentity | null = null
/** The latest list known to be backed up (it includes boards from your other devices). */
let remote: LibEntry[] = []
/** null = not checked yet, false = cloud backup isn't set up on this server */
let available: boolean | null = null

const listeners = new Set<() => void>()
export function onLibraryChange(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const changed = () => listeners.forEach((fn) => fn())

/* ---------- Crypto ---------- */

const enc = new TextEncoder()

async function digest(text: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)))
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

async function authHeader(secret: string) {
  return hex(await digest(`canvas-lib-auth:${secret}`))
}

async function aesKey(secret: string) {
  return crypto.subtle.importKey('raw', await digest(`canvas-lib-enc:${secret}`), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

function toBase64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function encrypt(secret: string, payload: Payload) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(JSON.stringify(payload))))
  const out = new Uint8Array(iv.length + data.length)
  out.set(iv)
  out.set(data, iv.length)
  return toBase64(out)
}

async function decrypt(secret: string, text: string): Promise<Payload | null> {
  try {
    const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, await aesKey(secret), bytes.subarray(12))
    const p = JSON.parse(new TextDecoder().decode(plain)) as Payload
    return p && p.v === 1 && Array.isArray(p.entries) ? p : null
  } catch {
    return null
  }
}

/* ---------- Merging lists ---------- */

function mergeEntry(a: LibEntry, b: LibEntry): LibEntry {
  const [newer, older] = a.updatedAt >= b.updatedAt ? [a, b] : [b, a]
  const out: LibEntry = { ...older, ...newer }
  const key = a.key ?? b.key
  if (key) out.key = key
  else delete out.key
  for (const f of ['removed', 'seen'] as const) {
    const t = Math.max(a[f] ?? 0, b[f] ?? 0)
    if (t) out[f] = t
    else delete out[f]
  }
  return out
}

function merge(...lists: LibEntry[][]) {
  const byId = new Map<string, LibEntry>()
  for (const list of lists)
    for (const e of list) {
      if (!e || typeof e.id !== 'string') continue
      const prev = byId.get(e.id)
      byId.set(e.id, prev ? mergeEntry(prev, e) : { ...e })
    }
  return [...byId.values()]
}

const isRemoved = (e: LibEntry) => !!e.removed && e.removed >= Math.max(e.updatedAt, e.seen ?? 0)

/** What this browser knows by itself: its saved boards and the ones it deleted. */
async function localEntries(): Promise<LibEntry[]> {
  const [index, removed] = await Promise.all([listBoards(), removedBoards()])
  const entries: LibEntry[] = index.map((m) => ({ ...m }))
  for (const [id, at] of Object.entries(removed)) entries.push({ id, title: '', updatedAt: 0, removed: at })
  return entries
}

/** Every board you have, newest first, including ones saved on your other devices. */
export async function allBoards(): Promise<BoardRow[]> {
  const index = await listBoards()
  const here = new Set(index.map((m) => m.id))
  return merge(remote, await localEntries())
    .filter((e) => e.updatedAt > 0 && !isRemoved(e))
    .map((e) => ({ ...e, here: here.has(e.id) }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** The edit key for a board you own on another device. */
export function keyFor(id: string) {
  const e = remote.find((x) => x.id === id)
  return e && !isRemoved(e) ? e.key : undefined
}

/** This device was refused with a key (it's someone else's board now): stop handing it out. */
export function forgetKey(id: string) {
  const e = remote.find((x) => x.id === id)
  if (e?.key) {
    delete e.key
    schedulePush()
  }
}

/* ---------- Sync ---------- */

async function ensureIdentity() {
  identity ??= (await getLocal<LibIdentity>('library')) ?? null
  if (!identity) {
    identity = { id: newLibId(), secret: newSecret() }
    await setLocal('library', identity)
  }
  return identity
}

async function request(method: 'GET' | 'PUT', body?: string) {
  const me = await ensureIdentity()
  const res = await fetch(`api/library?id=${me.id}`, {
    method,
    headers: { 'X-Library-Auth': await authHeader(me.secret), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body,
    cache: 'no-store',
  })
  // no function or no database behind it: the backup isn't available here
  const isApi = res.status === 204 || (res.headers.get('content-type') || '').includes('json')
  if (!isApi || res.status === 503) available = false
  else if (res.status < 500) available = true
  return res
}

/** Fetch the backed-up list (and Pro pass) and fold it into what we know. */
export async function pull() {
  if (available === false) return
  try {
    const me = await ensureIdentity()
    const res = await request('GET')
    if (!res.ok) return
    const { data } = (await res.json()) as { data: string }
    const payload = await decrypt(me.secret, data)
    if (!payload) return
    remote = merge(remote, payload.entries)
    if (payload.pro && !proToken()) {
      saveToken(payload.pro)
      void refreshPro()
    }
    changed()
  } catch {
    /* offline: try again later */
  }
}

let pushing: Promise<void> | null = null
let again = false

/** Done before the first backup, so boards from before My Canvas keep their edit rights. */
let keysFilled: Promise<void> | null = null

async function pushNow() {
  if (available === false) return
  await (keysFilled ??= fillIndexKeys())
  const me = await ensureIdentity()
  await pull()
  const entries = merge(remote, await localEntries())
  const pro = proToken() ?? undefined
  // nothing worth backing up yet (a first visit)
  if (!entries.length && !pro) return
  try {
    const data = await encrypt(me.secret, { v: 1, entries, pro })
    const res = await request('PUT', JSON.stringify({ data, updatedAt: Date.now() }))
    if (res.ok) {
      remote = entries
      changed()
    }
  } catch {
    /* offline: the next change or focus retries */
  }
}

/** Back up now, or right after the backup that's already running. */
export function pushLibrary(): Promise<void> {
  if (pushing) {
    again = true
    return pushing
  }
  pushing = pushNow().finally(() => {
    pushing = null
    if (again) {
      again = false
      void pushLibrary()
    }
  })
  return pushing
}

let pushTimer: ReturnType<typeof setTimeout> | undefined
function schedulePush() {
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void pushLibrary(), 2000)
}

/** Whether the backup works on this server (unknown until first checked). */
export function libraryAvailable() {
  return available
}

export async function myCanvasLink() {
  const me = await ensureIdentity()
  await pushLibrary()
  return `${location.origin}${location.pathname}#me=${me.id}.${me.secret}`
}

/**
 * Opening a My Canvas link (#me=…) on a device: from now on this browser uses
 * that library. Boards already on this device are added to it, not lost.
 */
export async function adoptLibrary(link: string): Promise<'same' | 'adopted' | 'invalid'> {
  const m = LINK_RE.exec(link)
  if (!m) return 'invalid'
  const [, id, secret] = m
  const current = await ensureIdentity()
  if (current.id === id && current.secret === secret) {
    await pull()
    return 'same'
  }
  identity = { id, secret }
  remote = []
  await setLocal('library', identity)
  await pull()
  await pushLibrary()
  return 'adopted'
}

let lastPull = 0
let started = false

/** Start keeping the backup in step with this browser. */
export function initLibrary() {
  if (started) return
  started = true
  // ask the browser not to clear our storage (Safari otherwise may after a week away)
  void navigator.storage?.persist?.().catch(() => false)
  onIndexChange(schedulePush)
  onProTokenChange(schedulePush)
  void pushLibrary().then(() => (lastPull = Date.now()))
  const onFocus = () => {
    if (Date.now() - lastPull < 30_000) return
    lastPull = Date.now()
    void pull()
  }
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && onFocus())
}
