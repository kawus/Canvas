import qrcode from 'qrcode-generator'
import { ArrowLeft, Check, ClipboardPaste, Copy, Eye, LaptopMinimal, MonitorSmartphone, Plus, Search, Share, Smartphone, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { connectMyCanvas, newBoard, openBoard } from '../boards'
import { allBoards, libraryAvailable, myCanvasIn, myCanvasLink, onLibraryChange, type BoardRow } from '../library'
import { helpUrl } from '../help'
import { useStore } from '../store'
import { BoardThumb } from './BoardThumb'
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
      {panel === 'boards' || panel === 'welcome' ? (
        <AllBoards close={close} welcome={panel === 'welcome'} />
      ) : panel === 'connect' ? (
        <Connect close={close} />
      ) : (
        <MyCanvas close={close} />
      )}
    </div>
  )
}

function items(n = 0) {
  return n === 1 ? '1 item' : `${n} items`
}

function AllBoards({ close, welcome }: { close: () => void; welcome: boolean }) {
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
      {welcome && <HomeScreenTip />}
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
            <BoardThumb id={b.id} version={b.updatedAt} here={b.here} />
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
          <MonitorSmartphone /> <span>Connect your devices</span>
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

/** Copying to the clipboard, with a short "Copied" state on the button. */
function useCopy() {
  const showToast = useStore((s) => s.showToast)
  const [copied, setCopied] = useState(false)
  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      },
      () => showToast('Couldn’t copy — please try again'),
    )
  return { copied, copy }
}

/** Shown in a Safari tab right after opening the link: the Home Screen app needs it too. */
function HomeScreenTip() {
  const { copied, copy } = useCopy()
  return (
    <div className="home-tip" data-testid="home-tip">
      <Smartphone />
      <div className="home-tip-text">
        <strong>Use Canvas from your Home Screen?</strong>
        <span>
          It keeps its own storage, so connect it too: copy your link, open the app, then tap the menu → Connect your
          devices → Paste it.
        </span>
        <button type="button" className="ghost-btn" onClick={() => void myCanvasLink().then(copy)} data-testid="tip-copy">
          {copied ? <Check /> : <Copy />} <span>{copied ? 'Copied — now open the app' : 'Copy my link'}</span>
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
  const proActive = useStore((s) => s.pro.active)
  const setPanel = useStore((s) => s.setPanel)
  const [link, setLink] = useState('')
  const { copied, copy } = useCopy()
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    void myCanvasLink().then((url) => {
      if (libraryAvailable() === false) setUnavailable(true)
      else setLink(url)
    })
  }, [])

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
            <button type="button" className="primary-btn" onClick={() => void copy(link)} disabled={!link} data-testid="me-copy">
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
            password manager.{' '}
            <a href={helpUrl('devices/')} target="_blank" rel="noopener">
              How this works
            </a>
          </p>
          <button type="button" className="text-btn me-connect" onClick={() => setPanel('connect')} data-testid="me-connect">
            <ClipboardPaste /> New device? Paste the link from your other one
          </button>
        </>
      )}
    </div>
  )
}

/** Paste a My Canvas link: the way into the Home Screen app, which links and QR codes can't open. */
function Connect({ close }: { close: () => void }) {
  const setPanel = useStore((s) => s.setPanel)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const canRead = typeof navigator.clipboard?.readText === 'function'

  const connect = async (value: string) => {
    if (!myCanvasIn(value)) {
      setError('That doesn’t look like a My Canvas link — those have “#me=” in them.')
      return
    }
    setBusy(true)
    await connectMyCanvas(value)
  }

  const paste = async () => {
    try {
      const value = await navigator.clipboard.readText()
      setText(value)
      if (myCanvasIn(value)) void connect(value)
      else setError('Your clipboard doesn’t hold a My Canvas link. Copy it on your other device first.')
    } catch {
      setError('Couldn’t read the clipboard — paste into the box instead.')
    }
  }

  return (
    <form
      className="dialog me-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-title"
      data-testid="connect"
      onSubmit={(e) => {
        e.preventDefault()
        void connect(text)
      }}
    >
      <button type="button" className="icon-btn dialog-back" aria-label="Back" onClick={() => setPanel('me')}>
        <ArrowLeft />
      </button>
      <button type="button" className="icon-btn dialog-close" aria-label="Close" onClick={close}>
        <X />
      </button>
      <h2 id="connect-title" className="dialog-title">
        Connect this device
      </h2>
      <p className="dialog-sub">
        Paste the My Canvas link from your other device. Your boards will show up here, and the ones already here stay.
      </p>
      {canRead && (
        <button type="button" className="primary-btn dialog-cta" onClick={() => void paste()} disabled={busy} data-testid="connect-paste">
          <ClipboardPaste /> <span>{busy ? 'Connecting…' : 'Paste my link'}</span>
        </button>
      )}
      <div className="link-row connect-row">
        <input
          className="field"
          value={text}
          placeholder={canRead ? 'or paste it here' : 'Paste your My Canvas link'}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value)
            setError('')
          }}
          aria-label="My Canvas link"
          data-testid="connect-input"
        />
        <button type="submit" className={canRead ? 'ghost-btn' : 'primary-btn'} disabled={!text.trim() || busy} data-testid="connect-go">
          <span>Connect</span>
        </button>
      </div>
      {error && <p className="dialog-error">{error}</p>}
      <p className="dialog-foot">Copy it on your other device under Connect your devices. Apple devices on the same Apple ID share the clipboard, so it pastes straight in here.{' '}
        <a href={helpUrl('devices/#i-use-canvas-from-my-home-screen-how-do-i-connect-it')} target="_blank" rel="noopener">
          Help
        </a>
      </p>
    </form>
  )
}
