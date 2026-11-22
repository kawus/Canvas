import { keepVersionOnNextSave } from './cloud'
import { editorId } from './library'
import { cleanElements } from './sanitize'
import { useStore } from './store'
import type { El } from './types'

/**
 * Earlier versions of a board (api/board.js keeps one an hour while people
 * work on it, for 30 days). Only editors can list and open them. Looking at
 * one changes nothing; restoring makes it the board again, as one undoable
 * step, and the board as it was just before is kept as a version too.
 */

export interface Editor {
  u: string
  n?: string
}
export interface Version {
  at: number
  by?: Editor
}
export interface History {
  now: Version
  created?: number
  versions: Version[]
}

const S = () => useStore.getState()
const endpoint = (id: string, query: string) => `api/board?id=${encodeURIComponent(id)}&${query}`

async function get(id: string, key: string, query: string) {
  try {
    const res = await fetch(endpoint(id, query), { cache: 'no-store', headers: { 'X-Edit-Key': key } })
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function loadHistory(id: string, key: string): Promise<History | null> {
  const data = await get(id, key, 'history=1')
  if (!data || !Array.isArray(data.versions)) return null
  return data as History
}

export async function loadVersion(id: string, key: string, at: number): Promise<El[] | null> {
  const data = await get(id, key, `version=${at}`)
  return Array.isArray(data?.elements) ? cleanElements(data.elements) : null
}

/** Whether a version was saved by you (on any of your connected devices): then only its time is shown. */
let mine: string | null = null
void editorId()
  .then((id) => (mine = id))
  .catch(() => {})
export const byOther = (v: Version) => (v.by && v.by.u !== mine ? v.by.n || 'Someone else' : null)

/* ---------- wording ---------- */

const dayStart = (t: number) => new Date(new Date(t).toDateString()).getTime()

/** "Today", "Yesterday" or "Monday 16 November" */
export function dayLabel(t: number, now = Date.now()) {
  const days = Math.round((dayStart(now) - dayStart(t)) / 864e5)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(t).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', ...(new Date(t).getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) })
}

export const timeLabel = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** "yesterday at 18:40", "today at 11:05", "Monday 16 November at 20:10" */
export function whenLabel(t: number) {
  const day = dayLabel(t)
  return `${day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day} at ${timeLabel(t)}`
}

/** Versions grouped by day, newest first. */
export function byDay(versions: Version[]) {
  const groups: { day: string; versions: Version[] }[] = []
  for (const v of versions) {
    const day = dayLabel(v.at)
    const last = groups[groups.length - 1]
    if (last?.day === day) last.versions.push(v)
    else groups.push({ day, versions: [v] })
  }
  return groups
}

/* ---------- restoring ---------- */

export function restore(version: Version, elements: El[]) {
  const s = S()
  const before = s.doc.elements
  // the board as it is now is kept as a version first (on the next save)
  keepVersionOnNextSave(s.doc.id)
  s.commit(elements, before)
  s.setVersionsOpen(false)
  const day = dayLabel(version.at)
  const what = day === 'Today' ? `the version from ${timeLabel(version.at)}` : day === 'Yesterday' ? 'yesterday’s version' : `the version from ${day}`
  s.showToast(`Restored ${what}. The one before is kept in Earlier versions.`, {
    label: 'Undo',
    run: () => S().undo(),
  })
}
