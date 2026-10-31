import { Keyboard, LifeBuoy, Sparkles, X, Hand } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { helpUrl, openHelp } from '../help'
import { inSafariTab } from '../library'
import { isIOS, isPhone, isTablet, keyLabels, touchFirst, type Key } from '../platform'
import { useStore } from '../store'
import { MenuItem, Tip, usePopover } from './ui'

/** The "?" in the corner: help centre, shortcuts or gestures (whichever fits this device), the tour. */
export function HelpButton() {
  const { open, setOpen, ref } = usePopover()
  const setPanel = useStore((s) => s.setPanel)
  const setTour = useStore((s) => s.setTour)
  const run = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }
  return (
    <div className="help-wrap" ref={ref}>
      <button
        type="button"
        className={`panel help-btn tip-top ${open ? 'is-open' : ''}`}
        aria-label="Help"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="help-button"
      >
        ?
        {!open && <Tip label="Help" />}
      </button>
      {open && (
        <div className="popover popover-up" role="menu" data-testid="help-menu">
          <MenuItem icon={<LifeBuoy />} onClick={run(() => openHelp())} testId="help-centre">
            Help centre
          </MenuItem>
          {touchFirst ? (
            <MenuItem icon={<Hand />} onClick={run(() => setPanel('keys'))} testId="help-keys">
              {isTablet ? 'Touch & Pencil gestures' : 'Touch gestures'}
            </MenuItem>
          ) : (
            <MenuItem icon={<Keyboard />} onClick={run(() => setPanel('keys'))} hint={<kbd className="menu-kbd">?</kbd>} testId="help-keys">
              Keyboard shortcuts
            </MenuItem>
          )}
          <MenuItem icon={<Sparkles />} onClick={run(() => setTour(true))} testId="help-tour">
            Welcome tour
          </MenuItem>
        </div>
      )}
    </div>
  )
}

/* ---------- Shortcuts & gestures ---------- */

type Row = [keys: Key[] | string, label: string]

const SHORTCUTS: { title: string; rows: Row[] }[] = [
  {
    title: 'Tools',
    rows: [
      [['V'], 'Select'],
      [['H'], 'Hand — or hold Space'],
      [['P'], 'Pen'],
      [['E'], 'Eraser'],
      [['R'], 'Rectangle'],
      [['O'], 'Ellipse'],
      [['A'], 'Arrow'],
      [['L'], 'Line'],
      [['N'], 'Sticky note'],
      [['T'], 'Text'],
      [['I'], 'Insert image'],
    ],
  },
  {
    title: 'Edit',
    rows: [
      [['mod', 'Z'], 'Undo'],
      [['shift', 'mod', 'Z'], 'Redo'],
      [['mod', 'C'], 'Copy'],
      [['mod', 'V'], 'Paste'],
      [['mod', 'D'], 'Duplicate'],
      [['mod', 'A'], 'Select all'],
      [['delete'], 'Delete'],
      [['Enter'], 'Edit text, or crop a photo'],
      [['←', '→'], 'Nudge (Shift for more)'],
      [['Esc'], 'Deselect'],
    ],
  },
  {
    title: 'Arrange',
    rows: [
      [[']'], 'Bring to front'],
      [['['], 'Send to back'],
      [['alt', 'A'], 'Align left'],
      [['alt', 'H'], 'Align centre'],
      [['alt', 'W'], 'Align top'],
      [['shift', 'alt', 'H'], 'Space evenly across'],
      ['alt-drag', 'Duplicate while dragging'],
      ['mod-drag', 'Move without snapping'],
      ['shift-resize', 'Keep proportions'],
    ],
  },
  {
    title: 'View',
    rows: [
      [['mod', '+'], 'Zoom in'],
      [['mod', '−'], 'Zoom out'],
      [['shift', '1'], 'Zoom to fit'],
      [['shift', '0'], 'Zoom to 100%'],
      ['mod-scroll', 'Zoom with the scroll wheel'],
      [['?'], 'Show this list'],
    ],
  },
]

const HOLD: Record<string, [Key, string]> = {
  'alt-drag': ['alt', 'drag'],
  'mod-drag': ['mod', 'drag'],
  'shift-resize': ['shift', 'resize'],
  'mod-scroll': ['mod', 'scroll'],
}

function Keys({ keys }: { keys: Key[] | string }) {
  if (typeof keys === 'string') {
    const [mod, action] = HOLD[keys]
    return (
      <span className="keys">
        <kbd>{keyLabels([mod])[0]}</kbd>
        <span className="keys-plus">+ {action}</span>
      </span>
    )
  }
  return (
    <span className="keys">
      {keyLabels(keys).map((k, i) => (
        <kbd key={i}>{k}</kbd>
      ))}
    </span>
  )
}

function gestures(): { title: string; rows: [ReactNode, string][] }[] {
  const pencil = isIOS ? 'Apple Pencil' : 'a stylus'
  return [
    {
      title: 'Move around',
      rows: [
        [<Gesture key="pinch" kind="pinch" />, 'Pinch to zoom in and out'],
        [<Gesture key="pan" kind="two" />, isTablet ? `Drag with two fingers — or one, once you’ve used ${pencil}` : 'Drag with two fingers to move around'],
      ],
    },
    {
      title: 'Draw & edit',
      rows: [
        ...(isTablet ? ([[<Gesture key="pen" kind="pen" />, `Draw with ${pencil} — your palm and fingers won’t leave marks`]] as [ReactNode, string][]) : []),
        [<Gesture key="tap" kind="tap" />, 'Tap to select, drag to move'],
        [<Gesture key="dbl" kind="double" />, 'Double-tap a shape to type inside it, or a photo to crop it'],
        [<Gesture key="hold" kind="hold" />, 'Press and hold a toolbar button for more tools'],
        ...(isTablet ? ([[<Gesture key="scribble" kind="pen" />, `Write in a text box with ${pencil} (Scribble)`]] as [ReactNode, string][]) : []),
      ],
    },
    {
      title: 'Handy',
      rows: [
        [<Gesture key="link" kind="double" />, 'Double-tap a link card to open the page'],
        ...(inSafariTab()
          ? ([[<Gesture key="home" kind="tap" />, 'Add Canvas to your Home Screen to use it full screen: Share → Add to Home Screen']] as [ReactNode, string][])
          : []),
      ],
    },
  ]
}

/** Tiny icons for the gestures: dots for fingers, a nib for the pen. */
function Gesture({ kind }: { kind: 'pinch' | 'two' | 'pen' | 'tap' | 'double' | 'hold' }) {
  return (
    <svg className={`gesture g-${kind}`} viewBox="0 0 32 32" aria-hidden>
      {kind === 'pinch' && (
        <>
          <circle cx="11" cy="21" r="3.2" />
          <circle cx="21" cy="11" r="3.2" />
          <path d="M5 27l3.5-3.5M27 5l-3.5 3.5" />
        </>
      )}
      {kind === 'two' && (
        <>
          <circle cx="12" cy="13" r="3.2" />
          <circle cx="20" cy="13" r="3.2" />
          <path d="M16 20v8M13 25l3 3 3-3" />
        </>
      )}
      {kind === 'pen' && <path d="M8 24l2.5-7L22 5.5a2.5 2.5 0 013.5 3.5L14 20.5zM8 24l4.5-1.8" />}
      {kind === 'tap' && (
        <>
          <circle cx="16" cy="16" r="3.4" />
          <circle cx="16" cy="16" r="8" className="ring" />
        </>
      )}
      {kind === 'double' && (
        <>
          <circle cx="16" cy="16" r="3.4" />
          <circle cx="16" cy="16" r="7.5" className="ring" />
          <circle cx="16" cy="16" r="11.5" className="ring" />
        </>
      )}
      {kind === 'hold' && (
        <>
          <circle cx="16" cy="16" r="5.5" />
          <path d="M16 6v-2M16 28v-2M6 16H4M28 16h-2" />
        </>
      )}
    </svg>
  )
}

export function ShortcutsDialog() {
  const panel = useStore((s) => s.panel)
  const setPanel = useStore((s) => s.setPanel)
  // iPad: gestures first, keyboard for those with a Magic Keyboard; iPhone: gestures only
  const [tab, setTab] = useState<'touch' | 'keys'>(touchFirst ? 'touch' : 'keys')
  const open = panel === 'keys'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setPanel(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, setPanel])

  if (!open) return null
  const showTabs = touchFirst && !isPhone
  const close = () => setPanel(null)

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`dialog keys-dialog ${tab === 'touch' ? 'is-touch' : ''}`} role="dialog" aria-modal="true" aria-labelledby="keys-title" data-testid="keys-dialog">
        <div className="keys-head">
          <h2 id="keys-title" className="insert-title">
            {tab === 'keys' ? 'Keyboard shortcuts' : isTablet ? 'Touch & Pencil' : 'Touch gestures'}
          </h2>
          {showTabs && (
            <div className="theme-row keys-tabs" role="tablist" aria-label="Show">
              <button type="button" role="tab" aria-selected={tab === 'touch'} className={`theme-btn ${tab === 'touch' ? 'is-active' : ''}`} onClick={() => setTab('touch')}>
                <Hand /> Touch
              </button>
              <button type="button" role="tab" aria-selected={tab === 'keys'} className={`theme-btn ${tab === 'keys' ? 'is-active' : ''}`} onClick={() => setTab('keys')} data-testid="keys-tab">
                <Keyboard /> Keyboard
              </button>
            </div>
          )}
          <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
            <X />
          </button>
        </div>
        <div className="keys-body">
          {tab === 'keys'
            ? SHORTCUTS.map((g) => (
                <section key={g.title} className="keys-group">
                  <h3>{g.title}</h3>
                  {g.rows.map(([keys, label]) => (
                    <div key={label} className="keys-row">
                      <span>{label}</span>
                      <Keys keys={keys} />
                    </div>
                  ))}
                </section>
              ))
            : gestures().map((g) => (
                <section key={g.title} className="keys-group">
                  <h3>{g.title}</h3>
                  {g.rows.map(([icon, label]) => (
                    <div key={label} className="keys-row touch-row">
                      {icon}
                      <span>{label}</span>
                    </div>
                  ))}
                </section>
              ))}
        </div>
        <div className="keys-foot">
          <a href={helpUrl(tab === 'keys' ? 'shortcuts/' : 'ipad-iphone/')} target="_blank" rel="noopener">
            More in the Help centre →
          </a>
        </div>
      </div>
    </div>
  )
}
