import { X } from 'lucide-react'
import { useEffect } from 'react'
import { linkLayout } from '../layout'
import { mediaOf } from '../media'
import { useStore } from '../store'
import type { LinkEl } from '../types'

/** Where a media card's picture is on screen. */
export function artBox(el: LinkEl, toScreen: (x: number, y: number) => [number, number], zoom: number) {
  const art = linkLayout(el).image
  if (!art) return null
  const [left, top] = toScreen(art.x, art.y)
  return { left, top, width: art.w * zoom, height: art.h * zoom }
}

/**
 * The service's own player, laid over the card's picture. It only loads once
 * someone presses play, with the privacy-enhanced settings each service offers.
 */
export function Player({ el, box, onStop }: { el: LinkEl; box: { left: number; top: number; width: number; height: number }; onStop: () => void }) {
  const media = mediaOf(el.url, el.player)
  if (!media) return null
  return (
    <div className={`media-player is-${media.kind}`} style={box} data-testid="media-player" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      <iframe
        src={media.embed}
        title={`${el.title} (${media.service})`}
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="eager"
      />
      <button type="button" className="media-stop" onClick={onStop} aria-label="Stop playing" title="Stop" data-testid="media-stop">
        <X />
      </button>
    </div>
  )
}

/** The video or song playing on the board, following it as you pan, zoom and move it. */
export function MediaLayer() {
  const id = useStore((s) => s.playing)
  const el = useStore((s) => {
    if (!s.playing) return undefined
    const found = (s.earlier?.elements ?? s.doc.elements).find((e) => e.id === s.playing)
    return found?.type === 'link' ? found : undefined
  })
  const v = useStore((s) => s.viewport)
  const cropping = useStore((s) => !!s.cropId)

  // the card was deleted (or isn't on this board): stop
  useEffect(() => {
    if (id && !el) useStore.getState().setPlaying(null)
  }, [id, el])

  if (!el || cropping) return null
  const box = artBox(el, (x, y) => [x * v.zoom + v.x, y * v.zoom + v.y], v.zoom)
  if (!box || box.width < 40 || box.height < 30) return null
  return (
    <div className="media-layer">
      <Player key={el.id} el={el} box={box} onStop={() => useStore.getState().setPlaying(null)} />
    </div>
  )
}
