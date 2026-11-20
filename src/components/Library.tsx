import qrcode from 'qrcode-generator'
import { ArrowLeft, Check, ClipboardPaste, Copy, Eye, LaptopMinimal, Mail, MonitorSmartphone, Plus, ScanLine, Search, Share, Smartphone, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { connectMyCanvas, newBoard, openBoard } from '../boards'
import { allBoards, canScan, inHomeScreenApp, libraryAvailable, myCanvasIn, myCanvasLink, onLibraryChange, pull, type BoardRow } from '../library'
import { helpUrl } from '../help'
import { track } from '../pro'
import { useStore } from '../store'
import { feedbackCounts, seenAt } from '../feedback'
import { BoardThumb } from './BoardThumb'
import { QrScanner } from './ConnectApp'
import { isPhone, touchFirst } from '../platform'
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
      ) : panel === 'scan' ? (
        <QrScanner close={close} />
      ) : (
        <Devices close={close} start={panel === 'connect' || isPhone || inHomeScreenApp() ? 'here' : 'add'} />
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
  // open notes from people you shared with, on your own boards
  const [notes, setNotes] = useState<Record<string, { open: number; latest: number }>>({})
  useEffect(() => {
    const mine = (boards ?? []).filter((b) => b.key).map((b) => b.id)
    if (mine.length) void feedbackCounts(mine).then(setNotes)
  }, [boards])

  useEffect(() => {
    const load = () => void allBoards().then(setBoards)
    load()
    // pick up boards just made on your other devices
    void pull()
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
            {b.key && notes[b.id] && notes[b.id].latest > seenAt(b.id) && (
              <span className="board-badge is-feedback" data-testid="board-feedback">
                {notes[b.id].open} new
              </span>
            )}
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
          It keeps its own storage, so connect it too: open the app and tap Scan code, or copy your link here and
          paste it there.
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

type DevicesTab = 'add' | 'here'

/**
 * Connect your devices: two simple jobs, one at a time. "Add another device"
 * shows this device's code to scan (and the link to copy or email);
 * "Connect this one" scans or pastes the code from another device. Phones and
 * the Home Screen app start on connecting, computers on showing the code.
 */
function Devices({ close, start }: { close: () => void; start: DevicesTab }) {
  const [tab, setTab] = useState<DevicesTab>(start)
  const [emailing, setEmailing] = useState(false)
  const [link, setLink] = useState('')
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    void myCanvasLink().then((url) => {
      if (libraryAvailable() === false) setUnavailable(true)
      else setLink(url)
    })
  }, [])

  return (
    <div className="dialog me-dialog devices" role="dialog" aria-modal="true" aria-labelledby="me-title" data-testid="my-canvas">
      {emailing && (
        <button type="button" className="icon-btn dialog-back" aria-label="Back" onClick={() => setEmailing(false)}>
          <ArrowLeft />
        </button>
      )}
      <button type="button" className="icon-btn dialog-close" aria-label="Close" onClick={close}>
        <X />
      </button>
      <h2 id="me-title" className="dialog-title">
        {emailing ? 'Email yourself the link' : 'Connect your devices'}
      </h2>
      {unavailable ? (
        <p className="dialog-sub">This needs cloud saving, which isn’t turned on for this site yet.</p>
      ) : emailing ? (
        <EmailBackup link={link} />
      ) : (
        <>
          <div className="theme-row devices-tabs" role="tablist" aria-label="Connect your devices">
            <button type="button" role="tab" aria-selected={tab === 'add'} className={`theme-btn ${tab === 'add' ? 'is-active' : ''}`} onClick={() => setTab('add')} data-testid="devices-add">
              Add another device
            </button>
            <button type="button" role="tab" aria-selected={tab === 'here'} className={`theme-btn ${tab === 'here' ? 'is-active' : ''}`} onClick={() => setTab('here')} data-testid="devices-here">
              Connect this one
            </button>
          </div>
          {tab === 'add' ? <ShowCode link={link} onEmail={() => setEmailing(true)} /> : <ConnectHere />}
        </>
      )}
    </div>
  )
}

/** This device's code, for another device to scan (or the link, to copy or email). */
function ShowCode({ link, onEmail }: { link: string; onEmail: () => void }) {
  const proActive = useStore((s) => s.pro.active)
  const { copied, copy } = useCopy()
  // on a phone or tablet the share sheet does it all (copy, AirDrop, messages)
  const share = touchFirst && typeof navigator.share === 'function'
  return (
    <>
      <p className="dialog-sub devices-sub">
        Scan this with your phone, iPad or other computer{proActive ? ' (your Pro comes along)' : ''}. Canvas on a Home Screen? Scan from inside the app.
      </p>
      <div className="qr-wrap" data-link={link}>
        {link ? <QrCode text={link} /> : <div className="qr qr-loading" />}
      </div>
      <div className="devices-acts">
        <button
          type="button"
          className="ghost-btn"
          disabled={!link}
          onClick={() => (share ? void navigator.share({ title: 'My Canvas', url: link }).catch(() => {}) : void copy(link))}
          data-testid="me-copy"
        >
          {share ? <Share /> : copied ? <Check /> : <Copy />} <span>{share ? 'Share link' : copied ? 'Copied' : 'Copy link'}</span>
        </button>
        <button type="button" className="ghost-btn" disabled={!link} onClick={onEmail} data-testid="me-email">
          <Mail /> <span>Email it to me</span>
        </button>
      </div>
      <p className="dialog-foot">
        Anyone with this link can edit your boards, so keep it private.{' '}
        <a href={helpUrl('devices/')} target="_blank" rel="noopener">
          How this works
        </a>
      </p>
    </>
  )
}

/** Bring your boards to this device: scan the code from another one, or paste its link. */
function ConnectHere() {
  const setPanel = useStore((s) => s.setPanel)
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const canRead = typeof navigator.clipboard?.readText === 'function'

  const connect = async (value: string) => {
    if (!myCanvasIn(value)) {
      setError('That doesn’t look like a My Canvas link. Those have “#me=” in them.')
      return
    }
    setBusy(true)
    await connectMyCanvas(value)
  }

  // straight from the clipboard; only if that doesn't work, a box to paste into
  const paste = async () => {
    if (!canRead) return setTyping(true)
    try {
      const value = await navigator.clipboard.readText()
      if (myCanvasIn(value)) return void connect(value)
      setError('Your clipboard doesn’t hold a My Canvas link. Copy it on your other device first, or paste it below.')
    } catch {
      /* not allowed: paste by hand */
    }
    setTyping(true)
  }

  return (
    <>
      <p className="dialog-sub devices-sub">On your other device, open Connect your devices, then scan its code from here.</p>
      <div className="devices-big">
        {canScan() && (
          <button type="button" className="primary-btn dialog-cta" onClick={() => setPanel('scan')} disabled={busy} data-testid="connect-scan">
            <ScanLine /> <span>Scan code</span>
          </button>
        )}
        <button type="button" className={`${canScan() ? 'ghost-btn' : 'primary-btn'} dialog-cta`} onClick={() => void paste()} disabled={busy} data-testid="connect-paste">
          <ClipboardPaste /> <span>{busy ? 'Connecting…' : 'Paste link'}</span>
        </button>
      </div>
      {typing && (
        <form
          className="link-row connect-row"
          onSubmit={(e) => {
            e.preventDefault()
            void connect(text)
          }}
        >
          <input
            className="field"
            value={text}
            placeholder="Paste your My Canvas link"
            autoFocus
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
          <button type="submit" className="primary-btn" disabled={!text.trim() || busy} data-testid="connect-go">
            <span>Connect</span>
          </button>
        </form>
      )}
      {error && <p className="dialog-error">{error}</p>}
      <p className="dialog-foot">
        Your boards come to this device, and the ones already here stay.{' '}
        <a href={helpUrl('devices/#how-do-i-get-my-boards-on-another-device')} target="_blank" rel="noopener">
          Help
        </a>
      </p>
    </>
  )
}

function EmailBackup({ link }: { link: string }) {
  const [email, setEmail] = useState('')
  const [updates, setUpdates] = useState(false)
  const [done, setDone] = useState<null | { listed: boolean | null }>(null)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const to = email.trim()
    const subject = 'My Canvas link (backup of my boards)'
    const body =
      `This is my private My Canvas link. Open it on any phone, iPad or computer to get all my boards back:\n\n${link}\n\n` +
      'Keep it private: anyone with this link can edit my boards.'
    location.href = `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    track('backup_email')
    let listed: boolean | null = null
    if (updates) {
      listed = await fetch('api/updates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: to }) })
        .then((r) => r.ok)
        .catch(() => false)
    }
    setDone({ listed })
  }

  return (
    <form className="email-backup" onSubmit={(e) => void send(e)} data-testid="email-backup">
      <p className="dialog-sub">A copy in your inbox means you can always get your boards back, even on a new phone.</p>
      <div className="link-row">
        <input
          className="field"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setDone(null)
          }}
          aria-label="Your email address"
          data-testid="backup-email"
        />
        <button type="submit" className="ghost-btn" disabled={!email.trim()} data-testid="backup-send">
          Email me the link
        </button>
      </div>
      <label className="check-row email-updates">
        <input type="checkbox" checked={updates} onChange={(e) => setUpdates(e.target.checked)} data-testid="backup-updates" />
        Also send me rare updates about Canvas
      </label>
      {done ? (
        <p className="email-note" role="status" data-testid="backup-done">
          Your email app should open with the link filled in. Just press Send.
          {done.listed === true && ' You’re on the updates list too.'}
          {done.listed === false && ' (Couldn’t add you to the updates list right now. Try again later.)'}
        </p>
      ) : (
        <p className="email-note">
          Opens your own email app, so Canvas never sees your link. If you tick updates, we keep only your email address.
        </p>
      )}
    </form>
  )
}

