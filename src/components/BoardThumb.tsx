import { useEffect, useRef, useState } from 'react'
import { fetchRemote } from '../cloud'
import { PALETTE_DARK, PALETTE_LIGHT } from '../constants'
import { geometricBounds } from '../geometry'
import { loadBoard } from '../storage'
import { useStore } from '../store'
import type { El } from '../types'
import { ElementView } from './Canvas'

/** Boards already drawn as previews, by id and version. */
const cache = new Map<string, El[]>()

async function elementsOf(id: string, version: number, here: boolean): Promise<El[]> {
  const key = `${id}@${version}`
  const hit = cache.get(key)
  if (hit) return hit
  let els: El[] = []
  if (here) els = (await loadBoard(id))?.elements ?? []
  else {
    // a board from another device: read it from the cloud
    const r = await fetchRemote(id)
    if (r.ok && r.value) els = r.value.elements
  }
  cache.set(key, els)
  return els
}

/** A small live miniature of a board, drawn only once it scrolls into view. */
export function BoardThumb({ id, version, here }: { id: string; version: number; here: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const current = useStore((s) => (s.doc.id === id ? s.doc.elements : null))
  const [els, setEls] = useState<El[] | null>(() => cache.get(`${id}@${version}`) ?? null)
  const dark = document.documentElement.dataset.theme === 'dark'

  useEffect(() => {
    if (current || els) return
    const node = ref.current
    if (!node) return
    let gone = false
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      void elementsOf(id, version, here).then((x) => !gone && setEls(x))
    })
    io.observe(node)
    return () => {
      gone = true
      io.disconnect()
    }
  }, [id, version, here, current, els])

  const shown = current ?? els
  const b = shown?.length ? geometricBounds(shown) : null
  const pad = b ? Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.06 + 8 : 0
  return (
    <div className="board-thumb" ref={ref} aria-hidden>
      {b && (
        <svg viewBox={`${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + pad * 2} ${b.maxY - b.minY + pad * 2}`} preserveAspectRatio="xMidYMid meet">
          {shown!.map((el) => (
            <ElementView key={el.id} el={el} palette={dark ? PALETTE_DARK : PALETTE_LIGHT} faded={false} editing={false} />
          ))}
        </svg>
      )}
    </div>
  )
}
