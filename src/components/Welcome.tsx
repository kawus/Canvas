import { ArrowLeft, ArrowRight, Share, SquarePlus } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { inSafariTab } from '../library'
import { fromIntro, markWelcomed } from '../onboarding'

/**
 * First-run welcome: an animated splash, then three short steps (Create,
 * Everywhere, Share & present). Who sees it is decided in onboarding.ts.
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
    eyebrow: 'Share & present',
    title: 'Share it, or present it',
    text: 'Send a view link in a tap, or invite people to draw with you live. Mark parts of your board as slides, and Canvas glides from one to the next as you present.',
    art: <PresentArt />,
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
  const [step, setStep] = useState(fromIntro ? 1 : 0)
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
              <p className="welcome-foot">Questions later? Tap the ? in the bottom corner.</p>
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
        <rect x="150" y="26" width="76" height="68" rx="4" className="w-paper" />
        <rect x="160" y="42" width="52" height="5" rx="2.5" className="w-paper-line" />
        <rect x="160" y="54" width="40" height="5" rx="2.5" className="w-paper-line" />
        <rect x="160" y="66" width="46" height="5" rx="2.5" className="w-paper-line" />
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

/** Step 3: a little board with two slides; the camera zooms into one, pulls back and glides to the next. */
function PresentArt() {
  return (
    <svg viewBox="0 0 320 180" className="art art-present">
      <defs>
        <clipPath id="w-screen">
          <rect width="320" height="180" rx="14" />
        </clipPath>
      </defs>
      <g clipPath="url(#w-screen)">
        <g className="p-cam">
          {/* slide 1: a note and a sketch */}
          <rect x="24" y="22" width="120" height="67.5" rx="2" className="p-frame" />
          <circle cx="28" cy="15" r="4.5" className="p-tag" />
          <rect x="34" y="34" width="54" height="7" rx="3.5" className="p-title" />
          <rect x="34" y="46" width="38" height="4" rx="2" className="p-line" />
          <g>
            <rect x="96" y="34" width="36" height="34" rx="2.5" className="w-paper" />
            <rect x="102" y="44" width="24" height="3" rx="1.5" className="w-paper-line" />
            <rect x="102" y="51" width="17" height="3" rx="1.5" className="w-paper-line" />
          </g>
          <path d="M36 72 Q 52 62 66 72 T 92 72" className="p-ink" />
          {/* slide 2: shapes */}
          <rect x="176" y="92" width="120" height="67.5" rx="2" className="p-frame" />
          <circle cx="180" cy="85" r="4.5" className="p-tag" />
          <rect x="188" y="106" width="40" height="40" rx="6" className="shape-purple" />
          <ellipse cx="262" cy="126" rx="22" ry="17" className="shape-green" />
          {/* the rest of the board */}
          <rect x="196" y="24" width="70" height="40" rx="8" className="shape-blue" />
          <rect x="40" y="112" width="34" height="32" rx="2.5" className="w-paper p-loose" />
          <path d="M96 150 Q 116 132 140 146" className="p-ink p-ink-2" />
        </g>
      </g>
      <g className="p-bar">
        <rect x="136" y="160" width="48" height="12" rx="6" />
        <circle cx="152" cy="166" r="1.6" className="p-dot p-dot-1" />
        <circle cx="160" cy="166" r="1.6" className="p-dot p-dot-2" />
        <circle cx="168" cy="166" r="1.6" className="p-dot" />
      </g>
    </svg>
  )
}

