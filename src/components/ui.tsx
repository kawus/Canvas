import { useEffect, useRef, useState, type ReactNode } from 'react'

export function Tip({ label, kbd }: { label: string; kbd?: string }) {
  return (
    <span className="tip" role="tooltip">
      {label}
      {kbd && <kbd>{kbd}</kbd>}
    </span>
  )
}

export function IconButton({
  label,
  kbd,
  active,
  disabled,
  onClick,
  children,
  tipSide = 'top',
  testId,
  className = '',
}: {
  label: string
  kbd?: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
  tipSide?: 'top' | 'bottom'
  testId?: string
  className?: string
}) {
  return (
    <button
      type="button"
      className={`icon-btn tip-${tipSide} ${active ? 'is-active' : ''} ${className}`}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
      <Tip label={label} kbd={kbd} />
    </button>
  )
}

/** Minimal popover: toggled by its trigger, closed by outside press or Escape. */
export function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // closing the popover shouldn't also deselect or switch tools
      e.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])
  return { open, setOpen, ref }
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  hint,
  testId,
}: {
  icon?: ReactNode
  children: ReactNode
  onClick: () => void
  danger?: boolean
  hint?: ReactNode
  testId?: string
}) {
  return (
    <button type="button" className={`menu-item ${danger ? 'is-danger' : ''}`} onClick={onClick} data-testid={testId}>
      {icon && <span className="menu-icon">{icon}</span>}
      <span className="menu-label">{children}</span>
      {hint && <span className="menu-hint">{hint}</span>}
    </button>
  )
}
