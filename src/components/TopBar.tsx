import {
  Check,
  ChevronDown,
  Copy,
  Download,
  FileCode,
  FileText,
  Image,
  Link2,
  Monitor,
  Moon,
  Plus,
  Share,
  Sun,
  Trash2,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { duplicateBoard, newBoard, openBoard, removeCurrentBoard } from '../boards'
import { exportPdf, exportPng, exportSvg } from '../export'
import { selectedElements, useStore, type ThemePref } from '../store'
import { listBoards, shareUrl } from '../storage'
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

export function BoardMenu() {
  const title = useStore((s) => s.doc.title)
  const id = useStore((s) => s.doc.id)
  const setTitle = useStore((s) => s.setTitle)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
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
              if (confirm('Delete this board? This can’t be undone.')) void removeCurrentBoard()
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
  const showToast = useStore((s) => s.showToast)
  const { open, setOpen, ref } = usePopover()
  const [copied, setCopied] = useState(false)
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (open) {
      setUrl(shareUrl(doc))
      setCopied(false)
    }
  }, [open, doc])

  const copy = async () => {
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
  const long = url.length > 30000

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
          <p className="pop-text">
            Anyone with the link gets their own copy — no sign‑in needed. Your board keeps saving here automatically.
          </p>
          <div className="url-row">
            <Link2 className="url-icon" />
            <input id="share-url" className="url-input" readOnly value={empty ? 'Draw something first' : url} onFocus={(e) => e.target.select()} />
          </div>
          <div className="pop-actions">
            {canNativeShare && (
              <button
                type="button"
                className="ghost-btn"
                disabled={empty}
                onClick={() => navigator.share({ title: doc.title, url }).catch(() => {})}
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
