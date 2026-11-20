import { ClipboardPaste, ScanLine, Smartphone, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { connectMyCanvas } from '../boards'
import { helpUrl } from '../help'
import { canScan, dismissConnectCard, inHomeScreenApp, isConnected, connectCardDismissed, myCanvasIn } from '../library'
import { useStore } from '../store'

/**
 * The Home Screen app on iPhone and iPad keeps its own storage, separate from
 * Safari, and links and QR codes (scanned with the Camera app) always open in
 * Safari. So the app offers to connect itself: scan the code shown under
 * "Connect your devices" on another device, right here, or paste the link.
 */
export function ConnectAppCard() {
  const loaded = useStore((s) => s.loaded)
  const panel = useStore((s) => s.panel)
  const presenting = useStore((s) => s.presenting !== null)
  const setPanel = useStore((s) => s.setPanel)
  const [hidden, setHidden] = useState(() => !inHomeScreenApp() || isConnected() || connectCardDismissed())
  // connected (by scanning or pasting): the card goes away for good
  useEffect(() => {
    if (hidden) return
    const t = setInterval(() => isConnected() && setHidden(true), 1000)
    return () => clearInterval(t)
  }, [hidden])
  if (hidden || !loaded || panel || presenting) return null
  return (
    <div className="connect-card panel" role="region" aria-label="Connect this app" data-testid="connect-card">
      <button
        type="button"
        className="icon-btn connect-card-x"
        aria-label="Not now"
        onClick={() => {
          dismissConnectCard()
          setHidden(true)
        }}
      >
        <X />
      </button>
      <div className="connect-card-head">
        <Smartphone />
        <b>Connect this app to your boards</b>
      </div>
      <p>The Home Screen app keeps its own boards. Scan the code under Connect your devices on your computer to bring yours here.</p>
      <div className="connect-card-acts">
        {canScan() && (
          <button type="button" className="primary-btn" onClick={() => setPanel('scan')} data-testid="connect-card-scan">
            <ScanLine /> <span>Scan code</span>
          </button>
        )}
        <button type="button" className={canScan() ? 'ghost-btn' : 'primary-btn'} onClick={() => setPanel('connect')} data-testid="connect-card-paste">
          <ClipboardPaste /> <span>Paste link</span>
        </button>
      </div>
    </div>
  )
}

type Phase = 'starting' | 'scanning' | 'denied' | 'nocamera' | 'wrong' | 'connecting'

/** Scan a My Canvas QR code with the camera, inside Canvas (so the Home Screen app connects itself). */
export function QrScanner({ close }: { close: () => void }) {
  const setPanel = useStore((s) => s.setPanel)
  const video = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<Phase>('starting')

  useEffect(() => {
    let stream: MediaStream | null = null
    let stopped = false
    let timer = 0
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const stop = () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      } catch (err) {
        setPhase((err as Error)?.name === 'NotAllowedError' ? 'denied' : 'nocamera')
        return
      }
      if (stopped) return stop()
      const v = video.current!
      v.srcObject = stream
      await v.play().catch(() => {})
      setPhase('scanning')
      // the decoder only loads when someone scans
      const { default: jsQR } = await import('jsqr')
      const look = () => {
        if (stopped) return
        if (v.videoWidth && ctx) {
          // a smaller copy of the frame is plenty to read a code, and much quicker
          const k = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight))
          canvas.width = Math.round(v.videoWidth * k)
          canvas.height = Math.round(v.videoHeight * k)
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
          const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' })
          if (code?.data) {
            if (myCanvasIn(code.data)) {
              stop()
              setPhase('connecting')
              void connectMyCanvas(code.data)
              return
            }
            setPhase('wrong')
          }
        }
        timer = window.setTimeout(look, 120)
      }
      look()
    })()
    return stop
  }, [])

  const trouble = phase === 'denied' || phase === 'nocamera'
  return (
    <div className="dialog scan-dialog" role="dialog" aria-modal="true" aria-labelledby="scan-title" data-testid="scan">
      <button type="button" className="icon-btn dialog-close" aria-label="Close" onClick={close}>
        <X />
      </button>
      <h2 id="scan-title" className="dialog-title">
        Scan your code
      </h2>
      <p className="dialog-sub">On your computer, open the board menu → Connect your devices, and point this at the code.</p>
      {!trouble && (
        <div className="scan-view">
          <video ref={video} playsInline muted aria-hidden />
          <span className="scan-frame" aria-hidden />
          {phase === 'connecting' && <span className="scan-note">Connecting…</span>}
          {phase === 'wrong' && <span className="scan-note">That’s not a My Canvas code — try the one under Connect your devices.</span>}
        </div>
      )}
      {trouble && (
        <p className="dialog-error">
          {phase === 'denied'
            ? 'Canvas needs the camera to scan. Allow it in Settings → Safari → Camera, or paste your link instead.'
            : 'No camera available here. Paste your link instead.'}
        </p>
      )}
      <button type="button" className={trouble ? 'primary-btn dialog-cta' : 'text-btn scan-paste'} onClick={() => setPanel('connect')} data-testid="scan-paste">
        <ClipboardPaste /> <span>Paste the link instead</span>
      </button>
      <p className="dialog-foot">
        The Camera app would open Safari, which keeps separate boards from the Home Screen app, so scan from here.{' '}
        <a href={helpUrl('devices/#i-use-canvas-from-my-home-screen-how-do-i-connect-it')} target="_blank" rel="noopener">
          Help
        </a>
      </p>
    </div>
  )
}
