import { Check, Eye, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { duplicateBoard } from '../boards'
import { formatPrice, startCheckout } from '../pro'
import { useStore } from '../store'

/** Canvas Pro: what you get and a way to pay (Stripe Checkout). */
export function UpgradeDialog() {
  const open = useStore((s) => s.upgradeOpen)
  const setOpen = useStore((s) => s.setUpgradeOpen)
  const config = useStore((s) => s.pro.config)
  const [billing, setBilling] = useState<'month' | 'year'>('year')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
      await startCheckout(billing)
    } catch {
      setError('Payments are unavailable right now. Please try again.')
      setBusy(false)
    }
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
            <Check /> Use Pro on all your devices with your private Pro link
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
          {busy ? 'Opening secure checkout…' : `Continue — ${billing === 'month' ? `${monthly}/month` : `${yearly}/year`}`}
        </button>
        {error && <p className="dialog-error">{error}</p>}
        <p className="dialog-foot">Secure payment by Stripe. Cancel anytime.</p>
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
