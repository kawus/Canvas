import { Mic, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { hashData, saveAsset } from '../assets'
import { addVoice } from '../moodboard'
import { useStore } from '../store'

const MAX_SECONDS = 60

/** + → Voice note: tap to record (up to a minute), tap again to put it on the board. */
export function VoiceRecorder() {
  const open = useStore((s) => s.insert === 'voice')
  if (!open) return null
  return <VoiceRecorderOpen />
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function VoiceRecorderOpen() {
  const close = () => useStore.getState().setInsert(null)
  const [state, setState] = useState<'idle' | 'asking' | 'recording' | 'saving' | 'denied' | 'unsupported'>(() =>
    typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia ? 'unsupported' : 'idle',
  )
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState<number[]>([])
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; ctx: AudioContext; started: number; peaks: number[]; timer: number } | null>(null)

  const cleanup = () => {
    const r = rec.current
    if (!r) return
    clearInterval(r.timer)
    r.stream.getTracks().forEach((t) => t.stop())
    void r.ctx.close().catch(() => {})
    rec.current = null
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        cancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cancel = () => {
    const r = rec.current
    if (r) {
      r.recorder.ondataavailable = null
      r.recorder.onstop = null
      if (r.recorder.state !== 'inactive') r.recorder.stop()
    }
    cleanup()
    close()
  }

  const start = async () => {
    setState('asking')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      setState('denied')
      return
    }
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported?.(t))
    const recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 48_000 })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    // loudness, for the waveform
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    const peaks: number[] = []
    const started = performance.now()
    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += ((v - 128) / 128) ** 2
      const rms = Math.min(1, Math.sqrt(sum / buf.length) * 4)
      peaks.push(rms)
      setLevel((l) => [...l.slice(-27), rms])
      const t = (performance.now() - started) / 1000
      setElapsed(t)
      if (t >= MAX_SECONDS) stop()
    }, 100)
    recorder.onstop = async () => {
      const duration = (performance.now() - started) / 1000
      cleanup()
      if (duration < 0.6 || !chunks.length) {
        close()
        return
      }
      setState('saving')
      const blob = new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' })
      const data = await new Promise<string>((resolve) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.readAsDataURL(blob)
      })
      const hash = await hashData(data)
      await saveAsset(hash, data)
      // 40 bars, each the loudest moment in its slice
      const n = 40
      const bars = Array.from({ length: n }, (_, i) => {
        const slice = peaks.slice(Math.floor((i / n) * peaks.length), Math.max(Math.floor(((i + 1) / n) * peaks.length), Math.floor((i / n) * peaks.length) + 1))
        return Math.round(Math.max(0.08, ...slice) * 100) / 100
      })
      close()
      addVoice(hash, duration, bars)
    }
    rec.current = { recorder, stream, ctx, started, peaks, timer }
    recorder.start(250)
    setState('recording')
  }

  const stop = () => {
    const r = rec.current
    if (r && r.recorder.state !== 'inactive') r.recorder.stop()
  }

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && cancel()}>
      <div className="dialog insert-dialog voice-dialog" role="dialog" aria-label="Record a voice note" data-testid="voice-dialog">
        <div className="insert-head">
          <Mic />
          <h2 className="insert-title">Voice note</h2>
        </div>
        {state === 'unsupported' ? (
          <p className="insert-hint">This browser can’t record sound. Try Safari, Chrome or Firefox.</p>
        ) : state === 'denied' ? (
          <p className="insert-hint is-error">Canvas isn’t allowed to use the microphone. Allow it in your browser’s settings for this site, then try again.</p>
        ) : (
          <>
            <div className="voice-stage">
              <button
                type="button"
                className={`voice-rec ${state === 'recording' ? 'is-on' : ''}`}
                onClick={() => (state === 'recording' ? stop() : state === 'idle' ? void start() : undefined)}
                disabled={state === 'asking' || state === 'saving'}
                aria-label={state === 'recording' ? 'Stop and add to the board' : 'Start recording'}
                data-testid="voice-rec"
              >
                {state === 'recording' ? <Square /> : <Mic />}
              </button>
              <div className="voice-meter" aria-hidden>
                {Array.from({ length: 28 }, (_, i) => (
                  <i key={i} style={{ height: `${Math.max(8, (level[i] ?? 0) * 100)}%` }} />
                ))}
              </div>
              <span className="voice-time">{state === 'recording' ? `${fmt(elapsed)} / 1:00` : '0:00'}</span>
            </div>
            <p className="insert-hint">
              {state === 'recording'
                ? 'Recording. Tap the square to put it on the board.'
                : state === 'saving'
                  ? 'Adding it to the board…'
                  : 'Tap the microphone and talk (up to a minute). Anyone who can see the board can play it.'}
            </p>
          </>
        )}
        <div className="pop-actions">
          <button type="button" className="ghost-btn" onClick={cancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
