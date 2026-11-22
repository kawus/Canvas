import { fontById, FONTS } from './fonts'
import type { El } from './types'

/**
 * A check on every board that comes from outside this device: the cloud, live
 * editing, earlier versions, share links, templates and pasted copies. A board
 * can be made by anyone, so nothing in it is trusted as it is.
 *
 * It repairs rather than removes: a bad colour becomes ink, an over-long text
 * is shortened, a link to a picture that isn't one of Canvas's own is dropped.
 * Only a piece that can't be shown at all (no id, an unknown kind, a position
 * that isn't a number, a link that isn't a web address) is left out. Fields it
 * doesn't know are kept as they are, so a board saved by a newer Canvas keeps
 * them when an older one saves it again; nothing here reads them.
 */

const TYPES = new Set(['freedraw', 'rect', 'ellipse', 'line', 'arrow', 'text', 'sticky', 'image', 'link', 'swatch', 'font', 'voice', 'slide'])
const COLORS = new Set(['ink', 'gray', 'red', 'orange', 'yellow', 'green', 'blue', 'violet'])
const SIZES = new Set(['s', 'm', 'l'])
const FILLS = new Set(['none', 'tint', 'solid'])
const ID = /^[\w.:-]{1,64}$/
/** images and voice notes: the content hash Canvas stores them under */
const HASH = /^[a-f0-9]{24}$/
const PLAYER = /^(album|track)=\d{1,15}$/
const HEX = /^#[0-9a-f]{6}$/i
/** far beyond any real board, but no Infinity or numbers that break drawing */
const FAR = 10_000_000

type Raw = Record<string, unknown>

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-FAR, Math.min(FAR, v)) : null)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const optText = (o: Raw, k: string, max: number) => {
  if (o[k] === undefined) return
  if (typeof o[k] === 'string') o[k] = (o[k] as string).slice(0, max)
  else delete o[k]
}
const optMatch = (o: Raw, k: string, re: RegExp) => {
  if (o[k] !== undefined && !(typeof o[k] === 'string' && re.test(o[k] as string))) delete o[k]
}

/** The given number fields, all finite (false if one isn't). */
function nums(o: Raw, keys: string[]) {
  for (const k of keys) {
    const n = num(o[k])
    if (n === null) return false
    o[k] = n
  }
  return true
}

/** A web address that opens as a page (http or https only). */
function webUrl(v: unknown) {
  if (typeof v !== 'string' || v.length > 2048) return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:' ? v : null
  } catch {
    return null
  }
}

export function cleanElement(raw: unknown): El | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o: Raw = { ...(raw as Raw) }
  if (typeof o.type !== 'string' || !TYPES.has(o.type) || typeof o.id !== 'string' || !ID.test(o.id)) return null
  if (!COLORS.has(o.color as string)) o.color = 'ink'
  optMatch(o, 'group', ID)

  switch (o.type) {
    case 'freedraw': {
      if (!Array.isArray(o.points)) return null
      const points = []
      for (const p of o.points.slice(0, 50_000)) {
        if (!Array.isArray(p)) continue
        const x = num(p[0])
        const y = num(p[1])
        if (x === null || y === null) continue
        const pr = num(p[2])
        points.push([x, y, pr === null ? 0.5 : Math.max(0, Math.min(1, pr))])
      }
      if (!points.length) return null
      o.points = points
      if (!SIZES.has(o.size as string)) o.size = 'm'
      o.pressure = o.pressure === true
      if (o.highlight !== undefined) o.highlight = o.highlight === true
      break
    }
    case 'rect':
    case 'ellipse':
      if (!nums(o, ['x', 'y', 'w', 'h'])) return null
      if (!SIZES.has(o.size as string)) o.size = 'm'
      if (!FILLS.has(o.fill as string)) o.fill = 'none'
      optText(o, 'text', 20_000)
      if (o.fontSize !== undefined && num(o.fontSize) === null) delete o.fontSize
      break
    case 'line':
    case 'arrow':
      if (!nums(o, ['x1', 'y1', 'x2', 'y2'])) return null
      if (!SIZES.has(o.size as string)) o.size = 'm'
      optMatch(o, 'start', ID)
      optMatch(o, 'end', ID)
      break
    case 'text':
      if (!nums(o, ['x', 'y'])) return null
      o.text = text(o.text, 20_000)
      o.fontSize = num(o.fontSize) ?? 24
      break
    case 'sticky':
      if (!nums(o, ['x', 'y', 'w', 'h'])) return null
      o.text = text(o.text, 20_000)
      o.fontSize = num(o.fontSize) ?? 24
      break
    case 'image': {
      if (!nums(o, ['x', 'y', 'w', 'h']) || typeof o.asset !== 'string' || !HASH.test(o.asset)) return null
      optMatch(o, 'src', HASH)
      const c = o.crop
      if (c !== undefined && !(Array.isArray(c) && c.length === 4 && c.every((n) => num(n) !== null && n >= -1 && n <= 2))) delete o.crop
      break
    }
    case 'link': {
      const url = webUrl(o.url)
      if (!nums(o, ['x', 'y', 'w', 'h']) || !url) return null
      o.url = url
      o.title = text(o.title, 500)
      optText(o, 'description', 1000)
      optText(o, 'site', 200)
      optMatch(o, 'image', HASH)
      optMatch(o, 'player', PLAYER)
      break
    }
    case 'swatch':
      if (!nums(o, ['x', 'y', 'w', 'h'])) return null
      if (typeof o.hex !== 'string' || !HEX.test(o.hex)) o.hex = '#8e8e93'
      break
    case 'font':
      if (!nums(o, ['x', 'y', 'w', 'h'])) return null
      // only Canvas's own typefaces
      if (typeof o.font !== 'string' || !fontById(o.font)) o.font = FONTS[0].id
      optText(o, 'sample', 200)
      break
    case 'voice':
      if (!nums(o, ['x', 'y', 'w', 'h']) || typeof o.asset !== 'string' || !HASH.test(o.asset)) return null
      o.duration = Math.max(0, Math.min(3600, num(o.duration) ?? 0))
      o.peaks = (Array.isArray(o.peaks) ? o.peaks : []).slice(0, 500).map((n) => Math.max(0, Math.min(1, num(n) ?? 0)))
      break
    case 'slide':
      if (!nums(o, ['x', 'y', 'w', 'h'])) return null
      o.name = text(o.name, 200)
      o.order = num(o.order) ?? 0
      break
  }
  return o as unknown as El
}

/** The same check, remembered per object: live editing re-reads the whole board on every change. */
const seen = new WeakMap<object, El | null>()
export function checkedElement(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null
  let el = seen.get(raw)
  if (el === undefined) {
    el = cleanElement(raw)
    seen.set(raw, el)
  }
  return el
}

/** A board's pieces from outside this device, checked (anything that isn't a list gives none). */
export function cleanElements(raw: unknown): El[] {
  if (!Array.isArray(raw)) return []
  const out: El[] = []
  const ids = new Set<string>()
  for (const r of raw) {
    const el = checkedElement(r)
    // (two pieces with the same id would confuse selection and saving: the first one stays)
    if (el && !ids.has(el.id)) {
      ids.add(el.id)
      out.push(el)
    }
  }
  return out
}

/** A board's name from outside this device. */
export const cleanTitle = (v: unknown) => (typeof v === 'string' ? v.slice(0, 200) : 'Untitled') || 'Untitled'
