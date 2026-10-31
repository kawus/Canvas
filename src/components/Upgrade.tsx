import { Check, Eye, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { duplicateBoard } from '../boards'
import { formatPrice, joinEarlyAccess, startCheckout, track } from '../pro'
import { helpUrl } from '../help'
import { useStore } from '../store'

/** Canvas Pro: what you get and a way to pay (Stripe Checkout). */
export function UpgradeDialog() {
  const open = useStore((s) => s.upgradeOpen)
  const setOpen = useStore((s) => s.setUpgradeOpen)
  const config = useStore((s) => s.pro.config)
  const [billing, setBilling] = useState<'month' | 'year'>('year')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const smoke = config?.mode === 'smoke'

  // smoke test: count how many people look at the offer
  useEffect(() => {
    if (!open) return
    setDone(false)
    setBusy(false)
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
  const monthly = formatPrice(config.month, config.currency)
  const yearly = formatPrice(config.year, config.currency)
  const saving = Math.round((1 - config.year / (config.month * 12)) * 100)

  const go = async () => {
    setBusy(true)
    setError('')
    try {
      if (smoke) {
        // no payment yet: record the choice and unlock early access
        await joinEarlyAccess(billing)
        setDone(true)
        setBusy(false)
      } else await startCheckout(billing)
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
            Canvas Pro is free while it’s in early access, so there’s nothing to pay. Live editing is now unlocked on
            this device.
          </p>
          <button type="button" className="primary-btn dialog-cta" onClick={() => setOpen(false)} data-testid="early-start">
            Start editing together
          </button>
          <p className="dialog-foot">Pro becomes a paid plan later — you’ll see it here first.</p>
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
        <p className="dialog-sub">Draw together, live.</p>
        <ul className="pro-list">
          <li>
            <Check /> Edit boards together in real time, with live cursors
          </li>
          <li>
            <Check /> People you invite join free — only you need Pro
          </li>
          <li>
            <Check /> Pro comes along to all your devices with your My Canvas link
          </li>
          <li>
            <Check /> Everything in Free: unlimited boards, view links, exports
          </li>
        </ul>
        <div className="theme-row billing" role="radiogroup" aria-label="Billing">
          <button
            type="button"
            role="radio"
            aria-checked={billing === 'month'}
            className={`theme-btn ${billing === 'month' ? 'is-active' : ''}`}
            onClick={() => setBilling('month')}
          >
            {monthly} / month
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={billing === 'year'}
            className={`theme-btn ${billing === 'year' ? 'is-active' : ''}`}
            onClick={() => setBilling('year')}
          >
            {yearly} / year
            {saving > 0 && <span className="save-pill">−{saving}%</span>}
          </button>
        </div>
        <button type="button" className="primary-btn dialog-cta" onClick={go} disabled={busy} data-testid="checkout">
          {busy ? (smoke ? 'One moment…' : 'Opening secure checkout…') : `Continue — ${billing === 'month' ? `${monthly}/month` : `${yearly}/year`}`}
        </button>
        {error && <p className="dialog-error">{error}</p>}
        <p className="dialog-foot">
          {smoke ? 'Cancel anytime.' : 'Secure payment by Stripe. Cancel anytime.'}{' '}
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
  return (
    <div className="view-bar panel" data-testid="view-bar">
      <span className="view-label">
        <Eye /> View only
      </span>
      <button type="button" className="primary-btn" onClick={() => void duplicateBoard()} data-testid="make-copy">
        Make a copy
      </button>
    </div>
  )
}
