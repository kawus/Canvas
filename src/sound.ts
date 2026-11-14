import { useStore } from './store'

/**
 * Soft, optional sounds: a wooden tap when something lands, a low tuk when a
 * drag is let go, a paper swish when something goes, and a two-note chime for
 * Tidy up. All made on the fly with Web Audio (no files), very quiet, with a
 * little pitch variation so repeats don't sound mechanical.
 *
 * The audio session is "ambient": on iPhone and iPad the sounds follow the
 * silent switch and mix with whatever else is playing.
 */

export type Sound = 'place' | 'drop' | 'remove' | 'tidy'

let ctx: AudioContext | null = null
let out: GainNode | null = null
let noise: AudioBuffer | null = null
let last = -1

function audio(): AudioContext | null {
  if (ctx) return ctx
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'ambient'
    ctx = new AC()
  } catch {
    return null
  }
  out = ctx.createGain()
  out.gain.value = 0.9
  // soften everything a touch, so nothing is bright or clicky
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 3200
  out.connect(lp).connect(ctx.destination)
  noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.3), ctx.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return ctx
}

/** Browsers only let sound start from a tap or click: wake the audio on the first one (and after the app was in the background). */
export function unlockSound() {
  if (!useStore.getState().sounds) return
  const c = audio()
  if (c && c.state !== 'running') void c.resume().catch(() => {})
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockSound, { capture: true, passive: true })
  window.addEventListener('keydown', unlockSound, { capture: true, passive: true })
}

const vary = (f: number) => f * (1 + (Math.random() - 0.5) * 0.06)

/** A short tone that starts at f0, slides to f1 and dies away. */
function tone(c: AudioContext, at: number, f0: number, f1: number, gain: number, decay: number, type: OscillatorType = 'sine') {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, at)
  o.frequency.exponentialRampToValueAtTime(f1, at + Math.min(0.05, decay / 2))
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay)
  o.connect(g).connect(out!)
  o.start(at)
  o.stop(at + decay + 0.02)
}

/** A breath of filtered noise, swept from one pitch to another. */
function swish(c: AudioContext, at: number, f0: number, f1: number, gain: number, length: number) {
  const s = c.createBufferSource()
  s.buffer = noise
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.2
  bp.frequency.setValueAtTime(f0, at)
  bp.frequency.exponentialRampToValueAtTime(f1, at + length)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + length * 0.3)
  g.gain.exponentialRampToValueAtTime(0.0001, at + length)
  s.connect(bp).connect(g).connect(out!)
  s.start(at)
  s.stop(at + length + 0.02)
}

/** A soft marimba-like note: a sine with a faint overtone. */
function note(c: AudioContext, at: number, f: number, gain: number) {
  tone(c, at, f, f, gain, 0.32)
  tone(c, at, f * 4, f * 4, gain * 0.12, 0.08)
}

export function play(sound: Sound, force = false) {
  if (!force && !useStore.getState().sounds) return
  const c = audio()
  if (!c || c.state !== 'running' || !out) return
  const now = c.currentTime
  // never stack: a burst of changes makes one sound
  if (now - last < 0.06) return
  last = now
  const at = now + 0.005
  switch (sound) {
    case 'place':
      tone(c, at, vary(700), vary(540), 0.07, 0.12)
      swish(c, at, 2400, 1800, 0.012, 0.02)
      break
    case 'drop':
      tone(c, at, vary(320), vary(230), 0.06, 0.1, 'triangle')
      break
    case 'remove':
      swish(c, at, vary(1800), 500, 0.035, 0.16)
      break
    case 'tidy': {
      const base = vary(523)
      note(c, at, base, 0.05)
      note(c, at + 0.075, base * 1.5, 0.04)
      break
    }
  }
}

/** Turning sounds on (from a click) wakes the audio and plays a tap, so you hear what you chose. */
export function previewSound() {
  const c = audio()
  if (!c) return
  const go = () => play('place', true)
  if (c.state === 'running') go()
  else void c.resume().then(go, () => {})
}
