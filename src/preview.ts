import { pushPreview } from './cloud'
import { boardSnapshot } from './export'
import { useStore } from './store'

/**
 * Link-preview pictures: when you share a board, Canvas saves a 1200×630
 * snapshot of it, so its link shows the board itself in messaging apps.
 * A shared board's picture is kept fresh when you leave it after changes.
 */

let busy = false

/** `sharing`: the Share window is open. Otherwise only boards shared before are refreshed. */
export async function refreshPreview(sharing: boolean) {
  const s = useStore.getState()
  const doc = s.doc
  if (busy || !s.cloud || !doc.key || !doc.elements.length) return
  if (doc.preview === doc.updatedAt) return // already up to date
  if (!sharing && doc.preview === undefined) return // never shared: nothing to keep fresh
  busy = true
  try {
    const picture = await boardSnapshot(doc.elements)
    if (!picture) return
    // a board shared for the first time may still be on its way to the cloud: try again shortly
    let saved = await pushPreview(doc.id, doc.key, picture)
    if (!saved) {
      await new Promise((r) => setTimeout(r, 2500))
      saved = await pushPreview(doc.id, doc.key, picture)
    }
    if (saved && useStore.getState().doc.id === doc.id) useStore.getState().setPreview(doc.updatedAt)
  } catch (err) {
    console.error(err)
  } finally {
    busy = false
  }
}
