/** What kind of device this is, so help and shortcuts can speak its language. */

const ua = navigator.userAgent
const coarse = window.matchMedia('(pointer: coarse)').matches

/** iPhone, iPad (which may say "Mac") and iPod. */
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
/** Mac-style keys: ⌘ ⌥ ⇧ instead of Ctrl, Alt, Shift. */
export const appleKeys = isIOS || /Mac/.test(ua)
/** Mostly used with fingers (and maybe a pen) rather than a mouse or trackpad. */
export const touchFirst = coarse
export const isPhone = /iPhone|iPod/.test(ua) || (coarse && Math.min(screen.width, screen.height) < 600)
export const isTablet = touchFirst && !isPhone

export type Key = 'mod' | 'shift' | 'alt' | 'delete' | string

/** A shortcut as the keys to show, e.g. ['shift', 'mod', 'Z'] → ⇧ ⌘ Z or Ctrl Shift Z. */
export function keyLabels(keys: Key[]) {
  const mods = ['mod', 'alt', 'shift']
  if (appleKeys) {
    const mac: Record<string, string> = { mod: '⌘', alt: '⌥', shift: '⇧', delete: '⌫' }
    const order = ['alt', 'shift', 'mod']
    const sorted = [...keys.filter((k) => mods.includes(k)).sort((a, b) => order.indexOf(a) - order.indexOf(b)), ...keys.filter((k) => !mods.includes(k))]
    return sorted.map((k) => mac[k] ?? k)
  }
  const pc: Record<string, string> = { mod: 'Ctrl', alt: 'Alt', shift: 'Shift', delete: 'Delete' }
  const sorted = [...keys.filter((k) => mods.includes(k)).sort((a, b) => mods.indexOf(a) - mods.indexOf(b)), ...keys.filter((k) => !mods.includes(k))]
  return sorted.map((k) => pc[k] ?? k)
}

/** Tooltip shortcuts are written Mac-style ("⇧⌘Z"); elsewhere show "Ctrl+Shift+Z". */
export function formatKbd(kbd: string) {
  if (appleKeys) return kbd
  const symbols: Record<string, Key> = { '⌘': 'mod', '⌥': 'alt', '⇧': 'shift' }
  const keys: Key[] = []
  let i = 0
  while (i < kbd.length && symbols[kbd[i]]) keys.push(symbols[kbd[i++]])
  const rest = kbd.slice(i)
  keys.push(rest === '⌫' ? 'delete' : rest)
  return keyLabels(keys).join('+')
}
