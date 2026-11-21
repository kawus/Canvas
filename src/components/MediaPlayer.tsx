import { Pause, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAsset } from '../assets'
import { mediaOf } from '../media'
import { useStore } from '../store'
import type { LinkEl, VoiceEl } from '../types'

type Box = { left: number; top: number; width: number; height: number }

/** A voice note playing: the card's own place, with a pause button and how far it's got. */
export function VoicePlayer({ el, box, onStop }: { el: VoiceEl; box: Box; onStop: () => void }) {
  const data = useAsset(el.asset)
  const audio = useRef<HTMLAudioElement>(null)
  const [at, setAt] = useState(0)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const a = audio.current
    if (!a || !data) return
    a.play().catch(() => setFailed(true))
  }, [data])
  const left = Math.max(0, el.duration - at)
  return (
    <div className="voice-player" style={{ ...box, borderRadius: box.height / 2 }} data-testid="voice-player" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      {data && <audio ref={audio} src={data} onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)} onEnded={onStop} onError={() => setFailed(true)} />}
      <button type="button" className="voice-pause" onClick={onStop} aria-label="Stop" data-testid="voice-stop">
        <Pause />
      </button>
      <div className="voice-progress" aria-hidden>
        <i style={{ width: `${Math.min(100, (at / Math.max(el.duration, 0.1)) * 100)}%` }} />
      </div>
      <span className="voice-left">{failed ? 'Can’t play' : !data ? '…' : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`}</span>
    </div>
  )
}

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
    return found?.type === 'link' || found?.type === 'voice' ? found : undefined
  })
  const v = useStore((s) => s.viewport)
  const cropping = useStore((s) => !!s.cropId)

  // the card was deleted (or isn't on this board): stop
  useEffect(() => {
    if (id && !el) useStore.getState().setPlaying(null)
  }, [id, el])

  if (!el || cropping) return null
  const stop = () => useStore.getState().setPlaying(null)
  if (el.type === 'voice') {
    return (
      <div className="media-layer">
        <VoicePlayer key={el.id} el={el} box={{ left: el.x * v.zoom + v.x, top: el.y * v.zoom + v.y, width: el.w * v.zoom, height: el.h * v.zoom }} onStop={stop} />
      </div>
    )
  }
  const box = playerBox(el, (x, y) => [x * v.zoom + v.x, y * v.zoom + v.y], v.zoom)
  if (!box) return null
  return (
    <div className="media-layer">
      <Player key={el.id} el={el} box={box} onStop={stop} />
    </div>
  )
}
