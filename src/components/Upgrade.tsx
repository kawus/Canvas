import { Check, Eye, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { duplicateBoard } from '../boards'
import { formatPrice, joinEarlyAccess, startCheckout, track } from '../pro'
import { helpUrl } from '../help'
import { useStore } from '../store'

/** Canvas Pro, sold as a one-time Founder licence (Stripe Checkout). */
export function UpgradeDialog() {
  const open = useStore((s) => s.upgradeOpen)
  const setOpen = useStore((s) => s.setUpgradeOpen)
  const config = useStore((s) => s.pro.config)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const smoke = config?.mode === 'smoke'

  // count how many people look at the offer
  useEffect(() => {
    if (!open) return
    setDone(false)
    setBusy(false)
    setError('')
    track('view')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, setOpen])

  if (!open || !config?.enabled) return null
  const price = formatPrice(config.founder, config.currency)

  const go = async () => {
    setBusy(true)
    setError('')
    try {
      if (smoke) {
        // no payments set up yet: record the choice and unlock early access
        await joinEarlyAccess('founder')
        setDone(true)
        setBusy(false)
      } else await startCheckout('founder')
    } catch {
      setError('Payments are unavailable right now. Please try again.')
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="early-title" data-testid="early-access">
          <div className="pro-badge">
            <Sparkles />
          </div>
          <h2 id="early-title" className="dialog-title">
            You’re in early
          </h2>
          <p className="dialog-sub">
            Canvas Pro is free while it’s in early access, so there’s nothing to pay. Everything in Pro is now unlocked on
            this device.
          </p>
          <button type="button" className="primary-btn dialog-cta" onClick={() => setOpen(false)} data-testid="early-start">
            Back to my board
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="upgrade-title" data-testid="upgrade-dialog">
        <button type="button" className="icon-btn dialog-close" aria-label="Close" onClick={() => setOpen(false)}>
          <X />
        </button>
        <div className="pro-badge">
          <Sparkles />
        </div>
        <h2 id="upgrade-title" className="dialog-title">
          Canvas Pro
        </h2>
        <p className="dialog-sub">Founder licence: pay once, keep it for good.</p>
        <ul className="pro-list">
          <li>
            <Check /> Edit boards together live, with cursors. Guests join free
          </li>
          <li>
            <Check /> No “Made with Canvas” mark on your shared boards and exports
          </li>
          <li>
            <Check /> Every Pro feature that comes later, at no extra cost
          </li>
          <li>
            <Check /> On all your devices, with your My Canvas link
          </li>
        </ul>
        <div className="founder-price" data-testid="founder-price">
          <b>{price}</b>
          <span>once · no subscription</span>
        </div>
        <button type="button" className="primary-btn dialog-cta" onClick={go} disabled={busy} data-testid="checkout">
          {busy ? (smoke ? 'One moment…' : 'Opening secure checkout…') : `Become a founder · ${price}`}
        </button>
        {error && <p className="dialog-error">{error}</p>}
        <p className="dialog-foot">
          {smoke ? 'Free during early access.' : 'Secure payment by Stripe, with a receipt.'} You help keep Canvas
          independent and private by design.{' '}
          <a href={helpUrl('pro/')} target="_blank" rel="noopener">
            Questions?
          </a>
        </p>
      </div>
    </div>
  )
}

/** Replaces the toolbar on boards you can only view. */
export function ViewBar() {
  // a founder's shared boards carry no mark
  const ownerPro = useStore((s) => !!s.doc.pro)
  return (
    <div className="view-bar panel" data-testid="view-bar">
      {/* every shared board is a small invitation to try Canvas (its own page, so the visits can be counted) */}
      {!ownerPro && (
      <a className="made-with" href="/made-with-canvas/" target="_blank" rel="noopener" aria-label="Made with Canvas" data-testid="made-with">
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="1" y="1" width="22" height="22" rx="6.5" />
          <path d="M7 15.5c2.2-4.6 4.2-7 6-7 2.4 0-1.6 7 1.2 7 1.1 0 2-1 2.8-2.4" />
        </svg>
        <span className="made-with-text">Made with Canvas</span>
      </a>
      )}
      {!ownerPro && <span className="view-sep" aria-hidden />}
      <span className="view-label">
        <Eye /> View only
      </span>
      <button type="button" className="primary-btn" onClick={() => void duplicateBoard()} data-testid="make-copy">
        Make a copy
      </button>
    </div>
  )
}
