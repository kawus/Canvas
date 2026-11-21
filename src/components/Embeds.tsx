import { useEffect, useState } from 'react'
import { isEmbed, mediaOf } from '../media'
import { useStore } from '../store'
import type { El, LinkEl, Viewport } from '../types'

/**
 * Video and music cards are the service's own embedded player (Spotify,
 * YouTube, SoundCloud…), drawn at the card's size and following the board as
 * it pans and zooms. While editing, a player can be used once its card is
 * selected (so a plain press and drag still moves it); viewers can use them
 * straight away. Players far off screen or too small to use aren't loaded
 * (the card's cover picture shows instead), except ones already in use.
 */

const MAX = 16
const MIN_PX = 110

export function embedsOf(elements: El[]) {
  return elements.filter((e): e is LinkEl => e.type === 'link' && isEmbed(mediaOf(e.url, e.player)))
}

export function EmbedFrame({ el, left, top, scale, live }: { el: LinkEl; left: number; top: number; scale: number; live: boolean }) {
  const media = mediaOf(el.url, el.player)
  if (!isEmbed(media)) return null
  return (
    <div
      className={`embed ${live ? 'is-live' : ''}`}
      style={{ left, top, width: Math.abs(el.w), height: Math.abs(el.h), transform: `scale(${scale})` }}
      data-testid="embed"
    >
      <iframe
        src={media.embed}
        title={`${el.title} (${media.service})`}
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}

/** Which players to show for this view: on screen (or already in use), big enough to use, nearest first. */
export function visibleEmbeds(cards: LinkEl[], v: Viewport, keep: Set<string>, w = window.innerWidth, h = window.innerHeight) {
  const margin = 240
  const scored = cards
    .map((el) => {
      const left = el.x * v.zoom + v.x
      const top = el.y * v.zoom + v.y
      const sw = Math.abs(el.w) * v.zoom
      const sh = Math.abs(el.h) * v.zoom
      const onScreen = left < w + margin && top < h + margin && left + sw > -margin && top + sh > -margin
      const dist = Math.hypot(left + sw / 2 - w / 2, top + sh / 2 - h / 2)
      return { el, left, top, ok: keep.has(el.id) || (onScreen && sw >= MIN_PX), dist }
    })
    .filter((x) => x.ok)
  // the nearest ones if there are too many, kept in board order (so players never get reshuffled)
  const chosen = new Set([...scored].sort((a, b) => a.dist - b.dist).slice(0, MAX).map((x) => x.el.id))
  return scored.filter((x) => chosen.has(x.el.id))
}

/** The players on the board (inside the canvas, under the selection handles). */
export function Embeds({ elements }: { elements: El[] }) {
  const v = useStore((s) => s.viewport)
  const selected = useStore((s) => s.selectedIds)
  const viewOnly = useStore((s) => !s.doc.key)
  const lifted = useStore((s) => s.lifted)
  const boardId = useStore((s) => s.doc.id)
  const cropping = useStore((s) => !!s.cropId)
  // while a finger or button is down (selecting, dragging), the players stay out of the way
  const [pressing, setPressing] = useState(false)
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.('.canvas')) setPressing(true)
    }
    const up = () => setPressing(false)
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
    }
  }, [])
  // players someone has used stay loaded (so music keeps playing while you pan away)
  const [kept, setKept] = useState<{ board: string; ids: Set<string> }>(() => ({ board: boardId, ids: new Set() }))
  const cards = embedsOf(elements)
  const single = selected.length === 1 ? selected[0] : null
  if (kept.board !== boardId) setKept({ board: boardId, ids: new Set() })
  else if (single && !kept.ids.has(single) && cards.some((c) => c.id === single)) setKept({ board: boardId, ids: new Set([...kept.ids, single]) })

  if (!cards.length || cropping) return null
  return (
    <div className="embed-layer">
      {visibleEmbeds(cards, v, kept.ids).map(({ el, left, top }) => (
        <EmbedFrame key={el.id} el={el} left={left} top={top} scale={v.zoom} live={(viewOnly || el.id === single) && !pressing && !lifted.includes(el.id)} />
      ))}
    </div>
  )
}
