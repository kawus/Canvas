import { X } from 'lucide-react'
import { useEffect } from 'react'
import { mediaOf } from '../media'
import { useStore } from '../store'
import type { LinkEl } from '../types'

type Box = { left: number; top: number; width: number; height: number }

/**
 * Where the player goes: the service's own full player at its native size,
 * centred on the card (a little bigger or smaller with the zoom, never tiny),
 * and kept inside the screen.
 */
export function playerBox(el: LinkEl, toScreen: (x: number, y: number) => [number, number], zoom: number) {
  const media = mediaOf(el.url, el.player)
  if (!media) return null
  const scale = Math.min(1.5, Math.max(0.75, zoom))
  let [w, h] = media.size.map((n) => n * scale)
  // never bigger than the screen
  const fit = Math.min(1, (window.innerWidth - 32) / w, (window.innerHeight - 32) / h)
  w *= fit
  h *= fit
  const [cx, cy] = toScreen(el.x + el.w / 2, el.y + el.h / 2)
  // centred on the card, but always fully on screen
  const left = Math.min(Math.max(16, cx - w / 2), window.innerWidth - w - 16)
  const top = Math.min(Math.max(16, cy - h / 2), window.innerHeight - h - 16)
  return { left, top, width: w, height: h }
}

/**
 * The service's own player, laid over the card's picture. It only loads once
 * someone presses play, with the privacy-enhanced settings each service offers.
 */
export function Player({ el, box, onStop }: { el: LinkEl; box: Box; onStop: () => void }) {
  const media = mediaOf(el.url, el.player)
  if (!media) return null
  return (
    <div className={`media-player is-${media.kind} is-${media.service.toLowerCase().replace(/\s+/g, '-')}`} style={box} data-testid="media-player" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
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
  const exists = useStore((s) => !!s.playing && (s.earlier?.elements ?? s.doc.elements).some((e) => e.id === s.playing))
  useEffect(() => {
    if (id && !exists) useStore.getState().setPlaying(null)
  }, [id, exists])

  if (!el || cropping) return null
  const stop = () => useStore.getState().setPlaying(null)
  const box = playerBox(el, (x, y) => [x * v.zoom + v.x, y * v.zoom + v.y], v.zoom)
  if (!box) return null
  return (
    <div className="media-layer">
      <Player key={el.id} el={el} box={box} onStop={stop} />
    </div>
  )
}
