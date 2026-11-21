import { loadAsset, peekAsset } from './assets'

/**
 * Voice notes play through one shared audio element, started inside the tap
 * itself: Safari only lets sound start in the moment of a tap, not a moment
 * later once a recording has loaded. Recordings on the board are loaded ahead
 * of time (preloadVoice), so they're ready when tapped.
 */

let audio: HTMLAudioElement | null = null
let current: string | null = null

export function voiceAudio() {
  audio ??= new Audio()
  return audio
}

export function preloadVoice(asset: string) {
  if (!peekAsset(asset)) void loadAsset(asset)
}

/** Start a voice note (call it from the tap). */
export function startVoice(asset: string) {
  const a = voiceAudio()
  current = asset
  const data = peekAsset(asset)
  if (data) {
    if (a.src !== data) a.src = data
    a.currentTime = 0
    void a.play().catch(() => {})
    return
  }
  // not loaded yet: claim the audio now (inside the tap), then play once it arrives
  void a.play().catch(() => {})
  void loadAsset(asset).then((url) => {
    if (!url || current !== asset) return
    a.src = url
    void a.play().catch(() => {})
  })
}

export function stopVoice() {
  current = null
  const a = audio
  if (!a) return
  a.pause()
}
