import { ArrowLeft, ArrowRight, Share, SquarePlus } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { helpUrl } from '../help'
import { inSafariTab } from '../library'
import { markWelcomed } from '../onboarding'

/**
 * First-run welcome: an animated splash, then three short steps (Create,
 * Everywhere, Together). Who sees it is decided in onboarding.ts.
 */

interface Step {
  eyebrow: string
  title: string
  text: ReactNode
  art: ReactNode
  done?: string
}

const STEPS: Step[] = [
  {
    eyebrow: 'Create',
    title: 'Draw, write, pin anything',
    text: 'Sketch with a mouse, your finger or Apple Pencil. Add shapes, sticky notes, text, images and links — they snap neatly into line as you go.',
    art: <CreateArt />,
  },
  {
    eyebrow: 'Everywhere',
    title: 'Saved, and on all your devices',
    text: 'Everything saves as you go, with no account. Your private My Canvas link brings all your boards to your phone, iPad and computer.',
    art: <DevicesArt />,
  },
  {
    eyebrow: 'Together',
    title: 'Share it, or make it together',
    text: 'Send a view link to anyone in a tap, or invite people to draw with you live and watch their cursors move.',
    art: <TogetherArt />,
  },
  // iPhone / iPad in Safari: nudge to the Home Screen app before the first board
  ...(inSafariTab()
    ? [
        {
          eyebrow: 'Home Screen',
          title: 'Put Canvas on your Home Screen',
          text: (
            <>
              It opens full screen, like an app. Tap{' '}
              <span className="welcome-chip">
                <Share /> Share
              </span>{' '}
              in Safari, then{' '}
              <span className="welcome-chip">
                <SquarePlus /> Add to Home Screen
              </span>
              , and start your first board from there.
            </>
          ),
          art: <HomeArt />,
          done: 'Got it',
        },
      ]
    : []),
]

export function Welcome({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [leaving, setLeaving] = useState(false)
  const primary = useRef<HTMLButtonElement>(null)
  const swipe = useRef<number | null>(null)
  const last = STEPS.length

  const go = (next: number) => {
    if (next < 0) return
    if (next > last) return close()
    setDir(next > step ? 1 : -1)
    setStep(next)
  }
  const close = () => {
    markWelcomed()
    setLeaving(true)
    setTimeout(onClose, 260)
  }

  useEffect(() => {
    primary.current?.focus({ preventScroll: true })
  }, [step])

  // arrows / Enter / Escape, without reaching the canvas shortcuts underneath
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') go(step + 1)
      else if (e.key === 'ArrowLeft') go(step - 1)
      else if (e.key === 'Tab') return
      else if (e.key !== 'Enter' && e.key !== ' ') e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const s = STEPS[step - 1]
  return (
    <div className={`welcome ${leaving ? 'is-leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby="welcome-title" data-testid="welcome">
      <div className="welcome-glow" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <div
        className="welcome-card"
        onPointerDown={(e) => (swipe.current = e.clientX)}
        onPointerUp={(e) => {
          if (swipe.current === null) return
          const dx = e.clientX - swipe.current
          swipe.current = null
          if (Math.abs(dx) > 60 && step > 0) go(step + (dx < 0 ? 1 : -1))
        }}
      >
        {step === 0 ? (
          <div className="welcome-splash" key="splash">
            <svg className="welcome-logo" viewBox="0 0 24 24" aria-hidden>
              <rect x="1" y="1" width="22" height="22" rx="6.5" className="logo-bg" />
              <path d="M7 15.5c2.2-4.6 4.2-7 6-7 2.4 0-1.6 7 1.2 7 1.1 0 2-1 2.8-2.4" className="logo-ink" pathLength={1} />
            </svg>
            <h1 id="welcome-title" className="welcome-name">
              Welcome to Canvas
            </h1>
            <p className="welcome-tagline">
              A calm, simple whiteboard for sketching ideas, planning things out and making moodboards. No sign-up — just
              start.
            </p>
            <div className="welcome-actions">
              <button type="button" ref={primary} className="primary-btn welcome-cta" onClick={() => go(1)} data-testid="welcome-start">
                <span>Show me around</span>
                <ArrowRight />
              </button>
              <button type="button" className="text-btn welcome-skip" onClick={close} data-testid="welcome-skip">
                Skip, start drawing
              </button>
            </div>
          </div>
        ) : (
          <div className={`welcome-step ${dir > 0 ? 'from-right' : 'from-left'}`} key={step} data-step={step}>
            <div className="welcome-stage" aria-hidden>
              {s.art}
            </div>
            <div className="welcome-eyebrow">
              {step} of {last} · {s.eyebrow}
            </div>
            <h2 id="welcome-title" className="welcome-title">
              {s.title}
            </h2>
            <p className="welcome-text">{s.text}</p>
            <div className="welcome-nav">
              {step < last ? (
                <button type="button" className="text-btn welcome-skip-step" onClick={close} data-testid="welcome-skip-step">
                  Skip
                </button>
              ) : (
                <button type="button" className="icon-btn welcome-back" aria-label="Back" onClick={() => go(step - 1)}>
                  <ArrowLeft />
                </button>
              )}
              <div className="welcome-dots" role="tablist" aria-label="Steps">
                {STEPS.map((x, i) => (
                  <button
                    key={x.eyebrow}
                    type="button"
                    role="tab"
                    aria-selected={i + 1 === step}
                    aria-label={`Step ${i + 1}: ${x.eyebrow}`}
                    className={i + 1 === step ? 'is-active' : ''}
                    onClick={() => go(i + 1)}
                  />
                ))}
              </div>
              <button type="button" ref={primary} className="primary-btn welcome-next" onClick={() => go(step + 1)} data-testid="welcome-next">
                <span>{step === last ? (s.done ?? 'Start drawing') : 'Next'}</span>
                {step < last && <ArrowRight />}
              </button>
            </div>
            {step === last && (
              <p className="welcome-foot">
                Questions later? Press <kbd>?</kbd> or open{' '}
                <a href={helpUrl()} target="_blank" rel="noopener">
                  Help &amp; support
                </a>
                .
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- Illustrations (looping SVG animations) ---------- */

const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Moves its parent along `path` from `from` to `to` (fractions of the loop). */
function Along({ path, dur, from, to }: { path: string; dur: number; from: number; to: number }) {
  if (still) return null
  return (
    <animateMotion
      dur={`${dur}s`}
      repeatCount="indefinite"
      path={path}
      calcMode="linear"
      keyPoints="0;0;1;1"
      keyTimes={`0;${from};${to};1`}
    />
  )
}

const SCRIBBLE = 'M30 128 C 42 84, 62 70, 76 96 S 104 142, 122 100'

function CreateArt() {
  return (
    <svg viewBox="0 0 320 180" className="art art-create">
      <path className="c-scribble" d={SCRIBBLE} pathLength={1} />
      <g className="c-pen">
        <Along path={SCRIBBLE} dur={6} from={0.04} to={0.2} />
        <path d="M0 0 L-5 -14 L-1 -18 L5 -15 L4 -3 Z" className="pen-body" />
        <path d="M0 0 L-1.6 -4.6 L1.4 -4 Z" className="pen-tip" />
      </g>
      <g className="c-sticky">
        <rect x="150" y="26" width="76" height="68" rx="4" className="sticky-paper" />
        <rect x="160" y="42" width="52" height="5" rx="2.5" className="sticky-line" />
        <rect x="160" y="54" width="40" height="5" rx="2.5" className="sticky-line" />
        <rect x="160" y="66" width="46" height="5" rx="2.5" className="sticky-line" />
      </g>
      <line className="c-guide" x1="150" y1="16" x2="150" y2="170" />
      <g className="c-box">
        <rect x="150" y="116" width="76" height="44" rx="9" className="shape-purple" />
      </g>
      <g className="c-ellipse">
        <ellipse cx="280" cy="98" rx="26" ry="20" className="shape-green" />
      </g>
      <path className="c-arrow" d="M230 56 Q 254 52 258 74" pathLength={1} />
      <path className="c-head" d="M251 68 L258 76 L264 68" />
    </svg>
  )
}

function MiniBoard({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path className="m-ink m-1" d="M6 40 C 12 18, 24 14, 30 28 S 44 46, 52 26" />
      <rect className="m-sticky m-2" x="62" y="10" width="30" height="28" rx="2" />
      <rect className="m-box m-3" x="62" y="46" width="30" height="18" rx="4" />
    </g>
  )
}

const ARC = 'M176 78 C 196 26, 218 26, 238 70'

function DevicesArt() {
  return (
    <svg viewBox="0 0 320 180" className="art art-devices">
      {/* laptop */}
      <rect x="22" y="38" width="152" height="98" rx="9" className="device" />
      <rect x="30" y="46" width="136" height="82" rx="4" className="device-screen" />
      <path d="M8 140 H188 L180 150 H16 Z" className="device-base" />
      <g className="d-laptop">
        <MiniBoard x={42} y={56} s={1.18} />
      </g>
      {/* phone */}
      <rect x="236" y="30" width="66" height="122" rx="13" className="device" />
      <rect x="242" y="40" width="54" height="102" rx="7" className="device-screen" />
      <g className="d-phone">
        <MiniBoard x={244} y={64} s={0.52} />
      </g>
      {/* sync */}
      <path className="d-arc" d={ARC} />
      <circle className="d-dot" r="4">
        <Along path={ARC} dur={5} from={0.16} to={0.4} />
      </circle>
      <g className="d-cloud" transform="translate(207 34)">
        <path d="M-12 4 a7 7 0 0 1 2-13.6 a9 9 0 0 1 17 2 a6 6 0 0 1 1 11.6 Z" className="cloud" />
        <path d="M-5 -2 l3.4 3.4 l6-6.4" className="cloud-check" />
      </g>
    </svg>
  )
}

const APPS = ['#ff9f0a', '#30d158', '#0a84ff', '#ff375f', '#bf5af2', '#64d2ff', '#ffd60a', '#8e8e93', '#5e5ce6', '#ff6482', '#32d74b']

function HomeArt() {
  // a phone's home screen: Share → Add to Home Screen → the Canvas icon appears
  const slots = Array.from({ length: 12 }, (_, i) => i)
  return (
    <svg viewBox="0 0 320 180" className="art art-home">
      <rect x="100" y="12" width="120" height="196" rx="20" className="device" />
      <rect x="107" y="19" width="106" height="182" rx="14" className="home-screen" />
      {slots.map((i) => {
        const x = 117 + (i % 4) * 22
        const y = 34 + Math.floor(i / 4) * 26
        if (i === 6)
          return (
            <g key={i} className="h-app" transform={`translate(${x} ${y})`}>
              <rect width="18" height="18" rx="5" className="h-app-bg" />
              <path d="M4.5 11.6c1.8-3.8 3.5-5.8 5-5.8 2 0-1.3 5.8 1 5.8.9 0 1.7-.8 2.3-2" className="h-app-ink" />
            </g>
          )
        return <rect key={i} x={x} y={y} width="18" height="18" rx="5" fill={APPS[i % APPS.length]} className="h-icon" />
      })}
      <g className="h-sheet">
        <rect x="107" y="96" width="106" height="110" rx="14" className="h-sheet-bg" />
        <rect x="150" y="101" width="20" height="3" rx="1.5" className="h-handle" />
        <rect x="114" y="112" width="92" height="18" rx="6" className="h-row" />
        <rect x="114" y="134" width="92" height="18" rx="6" className="h-row h-row-add" />
        <rect x="120" y="119" width="40" height="4" rx="2" className="h-text" />
        <rect x="120" y="141" width="54" height="4" rx="2" className="h-text h-text-add" />
        <rect x="193" y="138" width="9" height="9" rx="2.5" className="h-plus" />
      </g>
      <g className="h-tap" transform="translate(160 143)">
        <circle r="10" className="h-tap-ring" />
      </g>
      <g className="h-share" transform="translate(60 92)">
        <circle r="22" className="h-share-bg" />
        <path d="M0 -10 V4 M-5 -5 L0 -10 L5 -5 M-8 -1 V8 H8 V-1" className="h-share-icon" />
      </g>
      <path className="h-hint" d="M84 92 Q 98 92 104 100" />
    </svg>
  )
}

const SAM_PATH = 'M112 136 C 130 112, 146 146, 164 120 S 192 96, 206 112'

function Cursor({ name, className, children }: { name: string; className: string; children?: ReactNode }) {
  return (
    <g className={className}>
      {children}
      <path d="M0 0 L0 15 L4 11 L7.5 18 L10 17 L6.8 10 L12 10 Z" className="cursor" />
      <g transform="translate(10 18)">
        <rect width={name.length * 7 + 14} height="18" rx="9" className="cursor-tag" />
        <text x="7" y="12.5" className="cursor-name">
          {name}
        </text>
      </g>
    </g>
  )
}

function TogetherArt() {
  return (
    <svg viewBox="0 0 320 180" className="art art-together">
      <g className="t-sticky">
        <rect x="34" y="36" width="72" height="64" rx="4" className="sticky-paper" />
        <rect x="44" y="52" width="48" height="5" rx="2.5" className="sticky-line" />
        <rect x="44" y="64" width="36" height="5" rx="2.5" className="sticky-line" />
      </g>
      <rect x="30" y="32" width="80" height="72" rx="6" className="t-select" />
      <rect x="214" y="96" width="74" height="46" rx="9" className="shape-blue" />
      <path className="t-ink" d={SAM_PATH} pathLength={1} />
      <g transform={still ? 'translate(206 112)' : undefined}>
        <Cursor name="Sam" className="t-sam">
          <Along path={SAM_PATH} dur={6.5} from={0.12} to={0.5} />
        </Cursor>
      </g>
      <Cursor name="You" className="t-you" />
      <g className="t-avatars">
        <circle cx="222" cy="30" r="12" className="av av-you" />
        <text x="222" y="34" className="av-text">
          Y
        </text>
        <circle cx="242" cy="30" r="12" className="av av-sam" />
        <text x="242" y="34" className="av-text">
          S
        </text>
      </g>
    </svg>
  )
}
