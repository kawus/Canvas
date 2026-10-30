import qrcode from 'qrcode-generator'
import { Check, Copy, Eye, LaptopMinimal, MonitorSmartphone, Plus, Search, Share, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { newBoard, openBoard } from '../boards'
import { allBoards, libraryAvailable, myCanvasLink, onLibraryChange, type BoardRow } from '../library'
import { useStore } from '../store'
import { timeAgo } from './TopBar'

/** Close on Escape without also deselecting or switching tools. */
function useEscape(active: boolean, close: () => void) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, close])
}

export function LibraryDialogs() {
  const panel = useStore((s) => s.panel)
  const setPanel = useStore((s) => s.setPanel)
  const close = useMemo(() => () => setPanel(null), [setPanel])
  useEscape(!!panel, close)
  if (!panel) return null
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      {panel === 'boards' ? <AllBoards close={close} /> : <MyCanvas close={close} />}
    </div>
  )
}

function items(n = 0) {
  return n === 1 ? '1 item' : `${n} items`
}

function AllBoards({ close }: { close: () => void }) {
  const currentId = useStore((s) => s.doc.id)
  const setPanel = useStore((s) => s.setPanel)
  const [boards, setBoards] = useState<BoardRow[] | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const load = () => void allBoards().then(setBoards)
    load()
    return onLibraryChange(load)
  }, [])

  const q = query.trim().toLowerCase()
  const shown = (boards ?? []).filter((b) => !q || (b.title || 'Untitled').toLowerCase().includes(q))

  return (
    <div className="dialog boards-dialog" role="dialog" aria-modal="true" aria-labelledby="boards-title" data-testid="all-boards">
      <div className="boards-head">
        <h2 id="boards-title" className="insert-title">
          All boards
        </h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
          <X />
        </button>
      </div>
      {(boards?.length ?? 0) > 6 && (
        <label className="boards-search">
          <Search />
          <input
            className="field"
            placeholder="Search boards"
            value={query}
            autoFocus
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="boards-search"
          />
        </label>
      )}
      <div className="boards-list" role="list">
        {boards && !shown.length && <p className="boards-empty">{q ? 'No boards match.' : 'No boards yet.'}</p>}
        {shown.map((b) => (
          <button
            key={b.id}
            type="button"
            role="listitem"
            className={`board-row ${b.id === currentId ? 'is-current' : ''}`}
            onClick={() => {
              close()
              if (b.id !== currentId) void openBoard(b.id, { push: true })
            }}
            data-testid="board-row"
            data-id={b.id}
          >
            <span className="board-row-main">
              <span className="board-row-title">{b.title || 'Untitled'}</span>
              <span className="board-row-meta">
                {timeAgo(b.updatedAt)}
                {b.count !== undefined && ` · ${items(b.count)}`}
              </span>
            </span>
            {!b.key && (
              <span className="board-badge">
                <Eye /> View only
              </span>
            )}
            {!b.here && (
              <span className="board-badge" title="Saved on another of your devices">
                <LaptopMinimal /> Other device
              </span>
            )}
            {b.id === currentId && <span className="board-badge is-open">Open</span>}
          </button>
        ))}
      </div>
      <div className="boards-foot">
        <button type="button" className="ghost-btn" onClick={() => setPanel('me')} data-testid="open-my-canvas">
          <MonitorSmartphone /> <span>Open on another device</span>
        </button>
        <button
          type="button"
          className="primary-btn"
          onClick={() => {
            close()
            void newBoard()
          }}
        >
          <Plus /> <span>New board</span>
        </button>
      </div>
    </div>
  )
}

function QrCode({ text }: { text: string }) {
  const { path, size } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`
    return { path: d, size: n + 4 }
  }, [text])
  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label="QR code of your My Canvas link">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}

function MyCanvas({ close }: { close: () => void }) {
  const showToast = useStore((s) => s.showToast)
  const proActive = useStore((s) => s.pro.active)
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    void myCanvasLink().then((url) => {
      if (libraryAvailable() === false) setUnavailable(true)
      else setLink(url)
    })
  }, [])

  const copy = () =>
    navigator.clipboard.writeText(link).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      },
      () => showToast('Couldn’t copy — please try again'),
    )
  const canShare = typeof navigator.share === 'function'

  return (
    <div className="dialog me-dialog" role="dialog" aria-modal="true" aria-labelledby="me-title" data-testid="my-canvas">
      <button type="button" className="icon-btn dialog-close" aria-label="Close" onClick={close}>
        <X />
      </button>
      <h2 id="me-title" className="dialog-title">
        Your boards, everywhere
      </h2>
      {unavailable ? (
        <p className="dialog-sub">This needs cloud saving, which isn’t turned on for this site yet.</p>
      ) : (
        <>
          <p className="dialog-sub">
            Open this private link on your phone, iPad or another computer to find all your boards there — and keep
            editing them. No account needed{proActive ? '; your Pro comes along too' : ''}.
          </p>
          <div className="qr-wrap">{link ? <QrCode text={link} /> : <div className="qr qr-loading" />}</div>
          <div className="link-row">
            <input className="field" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="My Canvas link" data-testid="me-url" />
            <button type="button" className="primary-btn" onClick={copy} disabled={!link} data-testid="me-copy">
              {copied ? <Check /> : <Copy />} <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          {canShare && link && (
            <button
              type="button"
              className="ghost-btn me-share"
              onClick={() => void navigator.share({ title: 'My Canvas', url: link }).catch(() => {})}
            >
              <Share /> <span>Send to my other device</span>
            </button>
          )}
          <p className="dialog-foot">
            Keep it private — anyone with this link can edit your boards. Save it somewhere safe, like your notes or
            password manager.
          </p>
        </>
      )}
    </div>
  )
}
