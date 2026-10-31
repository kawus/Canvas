import { geometricBounds } from './geometry'
import { newElementId } from './storage'
import { selectedElements, useStore } from './store'
import type { Box, El } from './types'

/**
 * Groups: things that belong together carry the same `group` id. Clicking one
 * selects them all; double-clicking picks a single item inside. Groups are
 * flat (no groups inside groups), which keeps them simple.
 */

const S = () => useStore.getState()

/** Ids of everything in the same group as `id` (or just `id`). */
export function groupOf(elements: El[], id: string): string[] {
  const g = elements.find((e) => e.id === id)?.group
  return g ? elements.filter((e) => e.group === g).map((e) => e.id) : [id]
}

/** The ids, plus the rest of any group they belong to. */
export function withGroups(elements: El[], ids: string[]): string[] {
  const groups = new Set(elements.filter((e) => e.group && ids.includes(e.id)).map((e) => e.group))
  if (!groups.size) return ids
  const out = new Set(ids)
  for (const e of elements) if (e.group && groups.has(e.group)) out.add(e.id)
  return [...out]
}

/** Exactly one whole group is selected (it then looks and acts like one object). */
export function isWholeGroup(elements: El[], sel: El[]) {
  const g = sel[0]?.group
  if (!g || sel.length < 2 || sel.some((e) => e.group !== g)) return false
  return elements.filter((e) => e.group === g).length === sel.length
}

/** Each group as one unit, everything else on its own (for align, spacing, tidy up). */
export function units(els: El[]): El[][] {
  const byGroup = new Map<string, El[]>()
  const out: El[][] = []
  for (const e of els) {
    if (!e.group) out.push([e])
    else if (byGroup.has(e.group)) byGroup.get(e.group)!.push(e)
    else {
      const u = [e]
      byGroup.set(e.group, u)
      out.push(u)
    }
  }
  return out
}

export const unitBounds = (u: El[]): Box => geometricBounds(u)!

export function canGroup(sel: El[]) {
  return sel.length >= 2 && !sel.every((e) => e.group && e.group === sel[0].group)
}

export function canUngroup(sel: El[]) {
  return sel.some((e) => e.group)
}

export function groupSelection() {
  const s = S()
  const sel = selectedElements(s)
  if (!canGroup(sel)) return
  const g = newElementId()
  const ids = new Set(sel.map((e) => e.id))
  s.commit(s.doc.elements.map((e) => (ids.has(e.id) ? { ...e, group: g } : e)))
  s.showToast('Grouped')
}

export function ungroupSelection() {
  const s = S()
  const groups = new Set(selectedElements(s).flatMap((e) => (e.group ? [e.group] : [])))
  if (!groups.size) return
  s.commit(
    s.doc.elements.map((e) => {
      if (!e.group || !groups.has(e.group)) return e
      const { group: _, ...rest } = e
      return rest as El
    }),
  )
  s.showToast('Ungrouped')
}

/** Copies get their own groups (and a lone copy of a group member isn't grouped). */
export function regroup(els: El[]): El[] {
  const fresh = new Map<string, string>()
  const count = new Map<string, number>()
  for (const e of els) if (e.group) count.set(e.group, (count.get(e.group) ?? 0) + 1)
  return els.map((e) => {
    if (!e.group) return e
    if ((count.get(e.group) ?? 0) < 2) {
      const { group: _, ...rest } = e
      return rest as El
    }
    if (!fresh.has(e.group)) fresh.set(e.group, newElementId())
    return { ...e, group: fresh.get(e.group)! }
  })
}
