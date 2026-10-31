import {
  Check,
  ChevronDown,
  Cloud,
  CloudAlert,
  CloudOff,
  Copy,
  CreditCard,
  Eye,
  LayoutGrid,
  Lock,
  MonitorSmartphone,
  Download,
  FileCode,
  FileText,
  Image,
  Link2,
  LoaderCircle,
  Grid3x3,
  Magnet,
  Monitor,
  Moon,
  Plus,
  Share,
  Sparkles,
  Sun,
  Users,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { duplicateBoard, newBoard, openBoard, removeCurrentBoard, syncNow } from '../boards'
import { collabAvailable, getMe, setMyName } from '../collab'
import { exportPdf, exportPng, exportSvg } from '../export'
import { allBoards, onLibraryChange, pull, type BoardRow } from '../library'
import { refreshPreview } from '../preview'
import { openPortal, track } from '../pro'
import { selectedElements, useStore, type ThemePref } from '../store'
import { boardUrl, shareUrl } from '../storage'
import { MenuItem, usePopover } from './ui'

export function timeAgo(t: number) {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(t).toLocaleDateString()
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 24 24" aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="6.5" className="logo-bg" />
      <path d="M7 15.5c2.2-4.6 4.2-7 6-7 2.4 0-1.6 7 1.2 7 1.1 0 2-1 2.8-2.4" className="logo-ink" />
    </svg>
  )
}

const SYNC_LABEL = {
  loading: 'Loading from the cloud…',
  saving: 'Saving…',
  saved: 'Saved to the cloud — this link works on any device',
  offline: 'Offline — saved on this device, will sync when you’re back online',
  'too-large': 'Too large to sync — saved on this device only',
  error: 'Couldn’t sync — saved on this device, will retry',
} as const

function SyncIndicator() {
  const cloud = useStore((s) => s.cloud)
  const sync = useStore((s) => s.sync)
  if (!cloud || sync === 'idle') return null
  const icon =
    sync === 'saving' || sync === 'loading' ? (
      <LoaderCircle className="spin" />
    ) : sync === 'saved' ? (
      <Cloud />
    ) : sync === 'offline' ? (
      <CloudOff />
    ) : (
      <CloudAlert />
    )
  return (
    <span className={`sync sync-${sync} tip-bottom`} aria-label={SYNC_LABEL[sync]} data-testid="sync" data-state={sync}>
      {icon}
      <span className="tip">{SYNC_LABEL[sync]}</span>
    </span>
  )
}

export function BoardMenu() {
  const title = useStore((s) => s.doc.title)
  const id = useStore((s) => s.doc.id)
  const setTitle = useStore((s) => s.setTitle)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const cloud = useStore((s) => s.cloud)
  const snap = useStore((s) => s.snap)
  const setSnap = useStore((s) => s.setSnap)
  const gridSnap = useStore((s) => s.gridSnap)
  const setGridSnap = useStore((s) => s.setGridSnap)
  const editKey = useStore((s) => s.doc.key)
  const pro = useStore((s) => s.pro)
  const setUpgradeOpen = useStore((s) => s.setUpgradeOpen)
  const showToast = useStore((s) => s.showToast)
  const { open, setOpen, ref } = usePopover()
  const setPanel = useStore((s) => s.setPanel)
  const [boards, setBoards] = useState<BoardRow[]>([])

  useEffect(() => {
    if (!open) return
    void allBoards().then(setBoards)
    // pick up boards just made on your other devices
    void pull()
    return onLibraryChange(() => void allBoards().then(setBoards))
  }, [open])

  const others = boards.filter((b) => b.id !== id).slice(0, 4)
  const themes: { key: ThemePref; label: string; icon: ReactNode }[] = [
    { key: 'system', label: 'Auto', icon: <Monitor /> },
    { key: 'light', label: 'Light', icon: <Sun /> },
    { key: 'dark', label: 'Dark', icon: <Moon /> },
  ]

  return (
    <div className="board-menu panel" ref={ref}>
      <button
        type="button"
        className="board-trigger"
        aria-label="Boards menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="board-menu"
      >
        <Logo />
        <ChevronDown className="chev" />
      </button>
      <input
        className="title-input"
        value={title}
        aria-label="Board name"
        placeholder="Untitled"
        spellCheck={false}
        readOnly={!editKey}
        onChange={(e) => setTitle(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => !e.target.value.trim() && setTitle('Untitled')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
          e.stopPropagation()
        }}
        size={Math.max(4, Math.min(28, title.length + 1))}
        data-testid="title"
      />
      <SyncIndicator />
      {open && (
        <div className="popover popover-left" role="menu">
          <MenuItem
            icon={<Plus />}
            onClick={() => {
              setOpen(false)
              void newBoard()
            }}
            testId="new-board"
          >
            New board
          </MenuItem>
          {others.length > 0 && (
            <>
              <div className="menu-heading">Recent</div>
              {others.map((b) => (
                <MenuItem
                  key={b.id}
                  onClick={() => {
                    setOpen(false)
                    void openBoard(b.id, { push: true })
                  }}
                  hint={timeAgo(b.updatedAt)}
                >
                  {b.title || 'Untitled'}
                </MenuItem>
              ))}
            </>
          )}
          {boards.length > 1 && (
            <MenuItem
              icon={<LayoutGrid />}
              onClick={() => {
                setOpen(false)
                setPanel('boards')
              }}
              hint={boards.length}
              testId="all-boards"
            >
              All boards
            </MenuItem>
          )}
          {cloud && (
            <MenuItem
              icon={<MonitorSmartphone />}
              onClick={() => {
                setOpen(false)
                setPanel('me')
              }}
              testId="my-canvas"
            >
              Connect your devices
            </MenuItem>
          )}
          <div className="menu-sep" />
          <MenuItem
            icon={<Copy />}
            onClick={() => {
              setOpen(false)
              void duplicateBoard()
            }}
            testId="duplicate"
          >
            {editKey ? 'Duplicate board' : 'Make a copy'}
          </MenuItem>
          <MenuItem
            icon={<Trash2 />}
            danger
            onClick={() => {
              setOpen(false)
              const msg = !editKey
                ? 'Remove this board from your list?'
                : cloud
                  ? 'Delete this board for everyone with the link? This can’t be undone.'
                  : 'Delete this board? This can’t be undone.'
              if (confirm(msg)) void removeCurrentBoard()
            }}
          >
            {editKey ? 'Delete board' : 'Remove from my boards'}
          </MenuItem>
          {pro.paywall && (
            <>
              <div className="menu-sep" />
              {pro.active ? (
                <>
                  <div className="menu-heading pro-heading">
                    <Sparkles /> Canvas Pro{pro.config?.mode === 'smoke' ? ' · Early access' : ''}
                  </div>
                  {pro.config?.mode === 'live' && (
                  <MenuItem
                    icon={<CreditCard />}
                    onClick={() => {
                      setOpen(false)
                      void openPortal().catch(() => showToast('Couldn’t open billing — please try again'))
                    }}
                  >
                    Manage subscription
                  </MenuItem>
                  )}
                </>
              ) : (
                <MenuItem
                  icon={<Sparkles />}
                  onClick={() => {
                    setOpen(false)
                    setUpgradeOpen(true)
                  }}
                  testId="upgrade"
                >
                  Upgrade to Pro
                </MenuItem>
              )}
            </>
          )}
          <div className="menu-sep" />
          <MenuItem
            icon={<Magnet />}
            onClick={() => setSnap(!snap)}
            hint={snap ? <Check className="menu-check" /> : undefined}
            testId="snap-toggle"
          >
            Snap to objects
          </MenuItem>
          <MenuItem
            icon={<Grid3x3 />}
            onClick={() => setGridSnap(!gridSnap)}
            hint={gridSnap ? <Check className="menu-check" /> : undefined}
            testId="grid-toggle"
          >
            Snap to grid
          </MenuItem>
          <div className="menu-sep" />
          <div className="theme-row" role="radiogroup" aria-label="Appearance">
            {themes.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={theme === t.key}
                className={`theme-btn ${theme === t.key ? 'is-active' : ''}`}
                onClick={() => setTheme(t.key)}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function ShareButton() {
  const doc = useStore((s) => s.doc)
  const cloud = useStore((s) => s.cloud)
  const pro = useStore((s) => s.pro)
  const showToast = useStore((s) => s.showToast)
  const markShared = useStore((s) => s.markShared)
  const setUpgradeOpen = useStore((s) => s.setUpgradeOpen)
  const { open, setOpen, ref } = usePopover()
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'view' | 'edit'>('view')
  const [collabOn, setCollabOn] = useState(false)
  const [myName, setName] = useState(() => getMe().name)
  useEffect(() => {
    if (open) void collabAvailable().then(setCollabOn)
  }, [open])
  useEffect(() => {
    if (open) setCopied(false)
  }, [open, tab])

  const editable = !!doc.key
  // Without cloud saving there's nothing to view remotely: the link carries a copy of the board
  const snapshotOnly = cloud === false
  const showEditTab = editable && !snapshotOnly && collabOn
  const editing = showEditTab && tab === 'edit'
  // Inviting editors needs Pro (unless there's no paywall, or the board's owner already has Pro)
  const locked = editing && !!pro.paywall && !pro.active && !doc.pro
  // smoke test: count how many people hit the locked feature (once per opening)
  useEffect(() => {
    if (open && locked) track('locked')
  }, [open, locked])
  const snapshot = useMemo(() => (open && snapshotOnly ? shareUrl(doc) : ''), [open, snapshotOnly, doc])
  const url = snapshotOnly ? snapshot : editing ? boardUrl(doc.id, doc.key) : boardUrl(doc.id)
  const empty = doc.elements.length === 0

  // sharing: save a picture of the board for its link preview (after the board itself is saved)
  useEffect(() => {
    if (open && editable && !snapshotOnly && !empty) void syncNow().then(() => refreshPreview(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const shared = () => {
    if (!editing || locked) return
    // handing out the edit link turns on live editing for this board
    markShared()
    void syncNow()
  }

  const copy = async () => {
    shared()
    if (!snapshotOnly && editable) void syncNow()
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      showToast('Link copied')
    } catch {
      const input = document.getElementById('share-url') as HTMLInputElement | null
      input?.select()
      showToast('Press ⌘C to copy the link')
    }
  }

  const canNativeShare = typeof navigator.share === 'function'
  const long = snapshotOnly && url.length > 30000

  let text: string
  if (snapshotOnly) text = 'Anyone with the link gets their own copy to keep. No sign‑in needed.'
  else if (editing) text = 'Anyone with this link can edit the board with you, live — you’ll see each other’s cursors.'
  else if (editable) text = 'Anyone with the link can view this board as it changes, and make their own copy. No sign‑in needed.'
  else text = 'This board is view-only for you. Share the view link, or make a copy you can edit.'

  return (
    <div className="share-wrap" ref={ref}>
      <button type="button" className="primary-btn" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="share">
        <Share />
        <span>Share</span>
      </button>
      {open && (
        <div className="popover popover-right share-pop" data-testid="share-pop">
          <div className="pop-title">Share this board</div>
          {showEditTab && (
            <div className="theme-row share-modes" role="tablist" aria-label="Link type">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'view'}
                className={`theme-btn ${tab === 'view' ? 'is-active' : ''}`}
                onClick={() => setTab('view')}
                data-testid="mode-view"
              >
                <Eye /> View
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'edit'}
                className={`theme-btn ${tab === 'edit' ? 'is-active' : ''}`}
                onClick={() => setTab('edit')}
                data-testid="mode-edit"
              >
                <Users /> Edit together
                {pro.paywall && !pro.active && !doc.pro && <span className="pro-pill">Pro</span>}
              </button>
            </div>
          )}

          {locked ? (
            <div className="locked" data-testid="share-locked">
              <Lock className="locked-icon" />
              <p className="pop-text">
                Invite people to draw on this board with you, live — everyone editing at once, with cursors. Part of
                Canvas Pro; guests join free.
              </p>
              <div className="pop-actions">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => {
                    setOpen(false)
                    setUpgradeOpen(true)
                  }}
                  data-testid="share-upgrade"
                >
                  <Sparkles />
                  <span>Upgrade to Pro</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="pop-text">{text}</p>
              <div className="url-row">
                <Link2 className="url-icon" />
                <input
                  id="share-url"
                  className="url-input"
                  readOnly
                  value={empty && editable ? 'Draw something first' : url}
                  onFocus={(e) => {
                    e.target.select()
                    shared()
                  }}
                  data-testid="share-url"
                />
              </div>
              <div className="pop-actions">
                {!editable && (
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      setOpen(false)
                      void duplicateBoard()
                    }}
                    data-testid="share-make-copy"
                  >
                    Make a copy
                  </button>
                )}
                {canNativeShare && (
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={empty && editable}
                    onClick={() => {
                      shared()
                      navigator.share({ title: doc.title, url }).catch(() => {})
                    }}
                  >
                    More…
                  </button>
                )}
                <button type="button" className="primary-btn" onClick={copy} disabled={empty && editable} data-testid="copy-link">
                  {copied ? <Check /> : <Copy />}
                  <span>{copied ? 'Copied' : 'Copy link'}</span>
                </button>
              </div>
              {editing && (
                <label className="me-row">
                  <span className="me-dot" style={{ background: getMe().color }} />
                  You appear as
                  <input
                    className="me-input"
                    value={myName}
                    maxLength={40}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => {
                      setMyName(myName)
                      setName(getMe().name)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    data-testid="my-name"
                  />
                </label>
              )}
            </>
          )}
          {long && <p className="pop-note">This board is large, so the link is long. Some chat apps may cut it off — export a PDF instead.</p>}
          {snapshotOnly && <p className="pop-note">Turn on cloud saving to share live links that stay up to date.</p>}
        </div>
      )}
    </div>
  )
}

export function ExportButton() {
  const doc = useStore((s) => s.doc)
  const selectedIds = useStore((s) => s.selectedIds)
  const showToast = useStore((s) => s.showToast)
  const { open, setOpen, ref } = usePopover()
  const [onlySelection, setOnlySelection] = useState(false)
  const [busy, setBusy] = useState(false)

  const sel = selectedElements({ doc, selectedIds })
  const useSel = onlySelection && sel.length > 0
  const els = useSel ? sel : doc.elements

  const run = async (fn: typeof exportPdf) => {
    if (!els.length) {
      showToast('Nothing to export yet')
      return
    }
    setBusy(true)
    try {
      await fn(els, doc.title)
      setOpen(false)
    } catch (err) {
      console.error(err)
      showToast('Export failed — please try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="share-wrap" ref={ref}>
      <button
        type="button"
        className="icon-btn panel-btn tip-bottom"
        aria-label="Export"
        onClick={() => {
          setOnlySelection(sel.length > 0)
          setOpen(!open)
        }}
        data-testid="export"
      >
        <Download />
        <span className="tip">Export</span>
      </button>
      {open && (
        <div className="popover popover-right" role="menu">
          <div className="menu-heading">Export {useSel ? `${sel.length} selected` : 'board'}</div>
          <MenuItem icon={<FileText />} onClick={() => run(exportPdf)} hint="Vector" testId="export-pdf">
            PDF
          </MenuItem>
          <MenuItem icon={<Image />} onClick={() => run(exportPng)} hint="Image">
            PNG
          </MenuItem>
          <MenuItem icon={<FileCode />} onClick={() => run(exportSvg)} hint="Vector">
            SVG
          </MenuItem>
          {sel.length > 0 && (
            <>
              <div className="menu-sep" />
              <label className="check-row">
                <input type="checkbox" checked={onlySelection} onChange={(e) => setOnlySelection(e.target.checked)} />
                Only selection
              </label>
            </>
          )}
          {busy && <div className="menu-busy">Preparing…</div>}
        </div>
      )}
    </div>
  )
}
