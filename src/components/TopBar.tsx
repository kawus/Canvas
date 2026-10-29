import {
  Check,
  ChevronDown,
  Cloud,
  CloudAlert,
  CloudOff,
  Copy,
  Download,
  FileCode,
  FileText,
  Image,
  Link2,
  LoaderCircle,
  Monitor,
  Moon,
  Plus,
  Share,
  Sun,
  Trash2,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { duplicateBoard, newBoard, openBoard, removeCurrentBoard, syncNow } from '../boards'
import { exportPdf, exportPng, exportSvg } from '../export'
import { selectedElements, useStore, type ThemePref } from '../store'
import { boardUrl, listBoards, shareUrl } from '../storage'
import type { BoardMeta } from '../types'
import { MenuItem, usePopover } from './ui'

function timeAgo(t: number) {
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
  const { open, setOpen, ref } = usePopover()
  const [boards, setBoards] = useState<BoardMeta[]>([])

  useEffect(() => {
    if (open) void listBoards().then(setBoards)
  }, [open])

  const others = boards.filter((b) => b.id !== id).slice(0, 8)
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
                    void openBoard(b.id, true)
                  }}
                  hint={timeAgo(b.updatedAt)}
                >
                  {b.title || 'Untitled'}
                </MenuItem>
              ))}
            </>
          )}
          <div className="menu-sep" />
          <MenuItem
            icon={<Copy />}
            onClick={() => {
              setOpen(false)
              void duplicateBoard()
            }}
          >
            Duplicate board
          </MenuItem>
          <MenuItem
            icon={<Trash2 />}
            danger
            onClick={() => {
              setOpen(false)
              const msg = cloud
                ? 'Delete this board for everyone with the link? This can’t be undone.'
                : 'Delete this board? This can’t be undone.'
              if (confirm(msg)) void removeCurrentBoard()
            }}
          >
            Delete board
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
  const sync = useStore((s) => s.sync)
  const showToast = useStore((s) => s.showToast)
  const { open, setOpen, ref } = usePopover()
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState<'live' | 'copy'>('live')

  // A live link needs cloud storage; without it the link carries a snapshot instead.
  const live = !!cloud && mode === 'live' && sync !== 'too-large'
  const [snapshot, setSnapshot] = useState('')
  useEffect(() => {
    if (open && !live) setSnapshot(shareUrl(doc))
  }, [open, live, doc])
  useEffect(() => {
    if (open) setCopied(false)
  }, [open, mode])

  const url = live ? boardUrl(doc.id) : snapshot

  const copy = async () => {
    if (live) void syncNow()
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
  const empty = doc.elements.length === 0
  const long = !live && url.length > 30000

  return (
    <div className="share-wrap" ref={ref}>
      <button
        type="button"
        className="primary-btn"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        data-testid="share"
      >
        <Share />
        <span>Share</span>
      </button>
      {open && (
        <div className="popover popover-right share-pop" data-testid="share-pop">
          <div className="pop-title">Share this board</div>
          {cloud && (
            <div className="theme-row share-modes" role="radiogroup" aria-label="Link type">
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'live'}
                className={`theme-btn ${mode === 'live' ? 'is-active' : ''}`}
                onClick={() => setMode('live')}
                data-testid="mode-live"
              >
                Live board
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'copy'}
                className={`theme-btn ${mode === 'copy' ? 'is-active' : ''}`}
                onClick={() => setMode('copy')}
                data-testid="mode-copy"
              >
                A copy
              </button>
            </div>
          )}
          <p className="pop-text">
            {live
              ? 'Anyone with the link can open and edit this board, on any device. No sign‑in needed.'
              : 'Anyone with the link gets their own copy to keep. Your board stays as it is. No sign‑in needed.'}
          </p>
          <div className="url-row">
            <Link2 className="url-icon" />
            <input
              id="share-url"
              className="url-input"
              readOnly
              value={empty ? 'Draw something first' : url}
              onFocus={(e) => e.target.select()}
              data-testid="share-url"
            />
          </div>
          <div className="pop-actions">
            {canNativeShare && (
              <button
                type="button"
                className="ghost-btn"
                disabled={empty}
                onClick={() => {
                  if (live) void syncNow()
                  navigator.share({ title: doc.title, url }).catch(() => {})
                }}
              >
                More…
              </button>
            )}
            <button type="button" className="primary-btn" onClick={copy} disabled={empty} data-testid="copy-link">
              {copied ? <Check /> : <Copy />}
              <span>{copied ? 'Copied' : 'Copy link'}</span>
            </button>
          </div>
          {long && <p className="pop-note">This board is large, so the link is long. Some chat apps may cut it off — export a PDF instead.</p>}
          {cloud === false && (
            <p className="pop-note">Boards are saved in this browser. Turn on cloud saving to get live links that work on every device.</p>
          )}
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
