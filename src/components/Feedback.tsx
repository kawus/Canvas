import { ArrowUp, Check, ExternalLink, Heart, MessageCircle, RotateCcw, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useAsset } from '../assets'
import { COLOR_KEYS, STICKY_FILL, type Palette } from '../constants'
import { openLink } from '../controller'
import {
  chooseName,
  hasChosenName,
  markSeen,
  me,
  myLike,
  NOTE_MAX,
  namesById,
  openNotes,
  resolveNote,
  seenAt,
  sendNote,
  setFeedbackOn,
  timeAgo,
  toggleLike,
  useFeedback,
  type FbItem,
  type FbPerson,
} from '../feedback'
import { getBounds } from '../geometry'
import { toScreen } from '../handles'
import { glideToBox } from '../slides'
import { useStore } from '../store'
import type { El } from '../types'

/** How far hearts and pins follow the zoom: half size at most zoomed out, one and a half at most zoomed in. */
const MARK_MIN = 0.5
const MARK_MAX = 1.5

const F = useFeedback.getState
const setF = useFeedback.setState

/** An item with its person's latest name. */
const named = (x: FbItem, names: Map<string, string>): FbItem => {
  const name = names.get(x.by.id)
  return name && name !== x.by.name ? { ...x, by: { ...x.by, name } } : x
}

/* ---------- what an item is called, and its little picture ---------- */

function describe(el: El): string {
  switch (el.type) {
    case 'image':
      return 'a photo'
    case 'swatch':
      return `the ${el.hex.toUpperCase()} swatch`
    case 'link':
      return el.title ? `“${short(el.title)}”` : 'a link'
    case 'sticky':
    case 'text':
      return el.text?.trim() ? `“${short(el.text)}”` : el.type === 'sticky' ? 'a sticky note' : 'some text'
    case 'rect':
    case 'ellipse':
      return el.text?.trim() ? `“${short(el.text)}”` : 'a shape'
    case 'freedraw':
      return 'a drawing'
    case 'arrow':
    case 'line':
      return el.type === 'arrow' ? 'an arrow' : 'a line'
    default:
      return 'an item'
  }
}

const short = (t: string) => {
  const one = t.replace(/\s+/g, ' ').trim()
  return one.length > 28 ? one.slice(0, 26).trimEnd() + '…' : one
}

function Thumb({ el, palette, size = 'sm' }: { el: El | undefined; palette: Palette; size?: 'sm' | 'md' }) {
  const asset = el?.type === 'image' ? el.asset : el?.type === 'link' ? (el.image ?? '') : ''
  const url = useAsset(asset)
  let style: CSSProperties = {}
  if (el && (el.type === 'image' || el.type === 'link') && url) style = { backgroundImage: `url(${url})` }
  else if (el?.type === 'swatch') style = { background: el.hex }
  else if (el?.type === 'sticky') style = { background: STICKY_FILL[el.color] }
  else if (el && COLOR_KEYS.includes(el.color)) style = { background: `color-mix(in srgb, ${palette[el.color]} 22%, var(--panel-solid))` }
  return <span className={`fb-thumb fb-thumb-${size}`} style={style} aria-hidden />
}

function Avatar({ who }: { who: FbPerson }) {
  return (
    <span className="fb-av" style={{ background: who.color }} aria-hidden>
      {(who.name.trim()[0] || '?').toUpperCase()}
    </span>
  )
}

/* ---------- on the board: hearts, pins, the tapped item and a note's bubble ---------- */

/** Whether feedback shows on this board for this person. */
function useFeedbackVisible() {
  const board = useFeedback((s) => s.board)
  const on = useFeedback((s) => s.on)
  const docId = useStore((s) => s.doc.id)
  const owner = useStore((s) => !!s.doc.key)
  const presenting = useStore((s) => s.presenting !== null)
  if (board !== docId || presenting) return false
  return owner || on
}

export function FeedbackLayer({ palette }: { palette: Palette }) {
  const visible = useFeedbackVisible()
  const items = useFeedback((s) => s.items)
  const target = useFeedback((s) => s.target)
  const open = useFeedback((s) => s.open)
  const compose = useFeedback((s) => s.compose)
  const elements = useStore((s) => s.doc.elements)
  const v = useStore((s) => s.viewport)
  const owner = useStore((s) => !!s.doc.key)
  const byId = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements])

  // close a note's bubble on a press anywhere else
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.fb-bubble, .fb-pin, .fb-panel, .fb-pill')) setF({ open: null })
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const s = F()
      if (s.compose || s.target || s.open) {
        e.stopPropagation()
        setF({ compose: null, target: null, open: null })
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  if (!visible) return null
  const mine = me().id
  const names = namesById(items)
  const likes = new Map<string, FbPerson[]>()
  const notes = new Map<string, FbItem[]>()
  for (const x0 of items) {
    if (!byId.has(x0.target)) continue
    const x = named(x0, names)
    if (x.kind === 'like') likes.set(x.target, [...(likes.get(x.target) ?? []), x.by])
    else if (!x.resolved) notes.set(x.target, [...(notes.get(x.target) ?? []), x])
  }
  const box = (el: El) => {
    const b = getBounds(el)
    const [x0, y0] = toScreen(v, b.minX, b.minY)
    const [x1, y1] = toScreen(v, b.maxX, b.maxY)
    return { x0, y0, x1, y1 }
  }
  // hearts and pins belong to the items, so they grow and shrink with the board (within limits, so they stay readable and tappable)
  const k = Math.min(MARK_MAX, Math.max(MARK_MIN, v.zoom))
  // an item too small on screen to carry a mark shows none (it's still in the owner's list)
  const roomy = (b: { x0: number; y0: number; x1: number; y1: number }) => Math.min(b.x1 - b.x0, b.y1 - b.y0) >= 34 * k
  const pins: { note: FbItem; x: number; y: number }[] = []
  for (const [id, list] of notes) {
    const b = box(byId.get(id)!)
    const fits = roomy(b)
    list.forEach((note, i) => {
      if (fits || note.id === open) pins.push({ note, x: b.x0 + (8 + i * 22) * k, y: b.y0 + 38 * k })
    })
  }
  const tapped = target ? byId.get(target) : undefined
  const composing = compose === target
  const openPin = pins.find((p) => p.note.id === open)

  return (
    <div className="fb-layer" data-testid="feedback-layer">
      {tapped && <TappedItem el={tapped} b={box(tapped)} liked={myLike(items, tapped.id, mine)} chip={!composing} />}
      {[...likes].map(([id, who]) => {
        const b = box(byId.get(id)!)
        if (!roomy(b)) return null
        const liked = who.some((p) => p.id === mine)
        return (
          <button
            key={id}
            type="button"
            className={`fb-heart ${liked ? 'is-mine' : ''}`}
            style={{ left: b.x1 - 8 * k, top: b.y0 + 8 * k, transform: `translateX(-100%) scale(${k})` }}
            title={who.map((p) => p.name).join(', ')}
            aria-label={`${who.length} ${who.length === 1 ? 'like' : 'likes'}: ${who.map((p) => p.name).join(', ')}`}
            onClick={() => !owner && void toggleLike(id)}
            data-testid="fb-heart"
          >
            <Heart fill="currentColor" />
            {who.length}
          </button>
        )
      })}
      {pins.map(({ note, x, y }) => (
        <button
          key={note.id}
          type="button"
          className={`fb-pin ${open === note.id ? 'is-open' : ''}`}
          style={{ left: x, top: y, background: note.by.color, transform: `translateY(-100%) scale(${k})` }}
          aria-label={`Note from ${note.by.name}`}
          onClick={() => setF({ open: open === note.id ? null : note.id, target: null })}
          data-testid="fb-pin"
        >
          {(note.by.name.trim()[0] || '?').toUpperCase()}
        </button>
      ))}
      {openPin && <Bubble note={openPin.note} x={openPin.x} y={openPin.y} k={k} owner={owner} palette={palette} />}
    </div>
  )
}

function TappedItem({ el, b, liked, chip }: { el: El; b: { x0: number; y0: number; x1: number; y1: number }; liked: boolean; chip: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(200)
  useLayoutEffect(() => {
    if (ref.current) setW(ref.current.offsetWidth)
  }, [el.type, liked])
  const cx = Math.min(Math.max((b.x0 + b.x1) / 2, w / 2 + 8), window.innerWidth - w / 2 - 8)
  // above the item, or below it when there's no room at the top
  const above = b.y0 > 120
  const top = above ? b.y0 - 10 : Math.min(b.y1 + 10, window.innerHeight - 140)
  return (
    <>
      <div className="fb-ring" style={{ left: b.x0 - 3, top: b.y0 - 3, width: b.x1 - b.x0 + 6, height: b.y1 - b.y0 + 6 }} aria-hidden />
      {chip && (
      <div ref={ref} className={`fb-chip ${above ? '' : 'is-below'}`} style={{ left: cx, top }} role="toolbar" aria-label="Feedback" data-testid="fb-chip">
        <button type="button" className={`fb-chip-btn ${liked ? 'is-liked' : ''}`} onClick={() => void toggleLike(el.id)} data-testid="fb-like">
          <Heart fill={liked ? 'currentColor' : 'none'} />
          {liked ? 'Liked' : 'Like'}
        </button>
        <span className="fb-chip-sep" />
        <button type="button" className="fb-chip-btn" onClick={() => setF({ compose: el.id, error: null })} data-testid="fb-note">
          <MessageCircle />
          Note
        </button>
        {el.type === 'link' && (
          <>
            <span className="fb-chip-sep" />
            <button type="button" className="fb-chip-btn" onClick={() => openLink(el.url)}>
              <ExternalLink />
              Open
            </button>
          </>
        )}
      </div>
      )}
    </>
  )
}

function Bubble({ note, x, y, k, owner, palette }: { note: FbItem; x: number; y: number; k: number; owner: boolean; palette: Palette }) {
  const W = 260
  // beside the pin, whatever size it is at this zoom
  const pin = 30 * k
  const right = x + pin + 10 + W < window.innerWidth - 8
  const left = right ? x + pin + 8 : Math.max(8, x - 8 - W)
  const top = Math.min(Math.max(y - pin / 2 - 30, 64), window.innerHeight - 180)
  void palette
  return (
    <div className="fb-bubble" style={{ left, top, width: W }} role="dialog" aria-label={`Note from ${note.by.name}`} data-testid="fb-bubble">
      <div className="fb-who">
        <Avatar who={note.by} />
        <b>{note.by.name}</b>
        <span>{timeAgo(note.at)}</span>
      </div>
      <p className="fb-text">{note.text}</p>
      {owner && (
        <div className="fb-acts">
          <button type="button" className="fb-btn" onClick={() => resolveNote(note.id)} data-testid="fb-resolve">
            <Check /> Resolve
          </button>
        </div>
      )}
    </div>
  )
}

/* ---------- writing a note ---------- */

export function NoteComposer({ palette }: { palette: Palette }) {
  const compose = useFeedback((s) => s.compose)
  const el = useStore((s) => (compose ? s.doc.elements.find((e) => e.id === compose) : undefined))
  // a fresh sheet for every item
  return compose && el ? <Composer key={compose} el={el} palette={palette} /> : null
}

function Composer({ el, palette }: { el: El; palette: Palette }) {
  const sending = useFeedback((s) => s.sending)
  const error = useFeedback((s) => s.error)
  const [text, setText] = useState('')
  const [named, setNamed] = useState(hasChosenName)
  const [name, setName] = useState(() => (hasChosenName() ? me().name : ''))
  const field = useRef<HTMLTextAreaElement>(null)
  const nameField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => (hasChosenName() ? field.current : nameField.current)?.focus())
    return () => cancelAnimationFrame(id)
  }, [])

  const ok = text.trim().length > 0 && (named || name.trim().length > 0) && !sending
  const send = async () => {
    if (!ok) return
    if (!named || name.trim() !== me().name) chooseName(name)
    if (await sendNote(el.id, text)) setText('')
  }
  const left = NOTE_MAX - text.length

  return (
    <div className="fb-sheet" role="dialog" aria-label="Leave a note" data-testid="fb-composer">
      <div className="fb-sheet-head">
        <Thumb el={el} palette={palette} />
        <span>Note on {describe(el)}</span>
        <button type="button" className="icon-btn fb-close" aria-label="Close" onClick={() => setF({ compose: null })}>
          <X />
        </button>
      </div>
      {!named && (
        <input
          ref={nameField}
          className="fb-name"
          placeholder="Your name"
          value={name}
          maxLength={40}
          autoComplete="given-name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') field.current?.focus()
          }}
          data-testid="fb-name"
        />
      )}
      <textarea
        ref={field}
        className="fb-field"
        placeholder="What do you think?"
        value={text}
        maxLength={NOTE_MAX}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void send()
          }
        }}
        data-testid="fb-text"
      />
      {error && <p className="fb-error">{error}</p>}
      <div className="fb-sheet-foot">
        {named ? (
          <span className="fb-as">
            <Avatar who={{ ...me(), name: name || me().name }} />
            As <b>{name || me().name}</b> ·{' '}
            <button type="button" className="fb-link" onClick={() => { setNamed(false); requestAnimationFrame(() => nameField.current?.focus()) }}>
              change
            </button>
          </span>
        ) : (
          <span className="fb-as">Shown with your note</span>
        )}
        <span className="fb-sheet-send">
          {left <= 40 && <span className={`fb-left ${left <= 0 ? 'is-out' : ''}`}>{left}</span>}
          <button type="button" className="fb-send" aria-label="Send note" disabled={!ok} onClick={() => void send()} data-testid="fb-send">
            <ArrowUp />
          </button>
        </span>
      </div>
    </div>
  )
}

/* ---------- the owner's feedback list ---------- */

export function FeedbackButton({ palette }: { palette: Palette }) {
  const board = useFeedback((s) => s.board)
  const items = useFeedback((s) => s.items)
  const panel = useFeedback((s) => s.panel)
  const docId = useStore((s) => s.doc.id)
  const owner = useStore((s) => !!s.doc.key)
  const elements = useStore((s) => s.doc.elements)
  const ref = useRef<HTMLDivElement>(null)
  // when this board's feedback was last looked at (read again when another board opens)
  const [seenState, setSeenState] = useState(() => ({ id: docId, at: seenAt(docId) }))
  const seen = seenState.id === docId ? seenState.at : seenAt(docId)
  const setSeen = (at: number) => setSeenState({ id: docId, at })

  useEffect(() => {
    if (!panel) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest?.('.fb-bubble')) setF({ panel: false })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setF({ panel: false })
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [panel])

  if (!owner || board !== docId || !items.length) return null
  const ids = new Set(elements.map((e) => e.id))
  const open = openNotes(items, ids)
  const fresh = open.some((n) => n.at > seen && n.by.id !== me().id)
  const toggle = () => {
    if (!panel) {
      // what's in the list now counts as seen, but stays marked until the list closes
      markSeen(docId, Math.max(Date.now(), ...items.map((x) => x.at)))
    } else setSeen(seenAt(docId))
    setF({ panel: !panel, open: null })
  }

  return (
    <div className="share-wrap" ref={ref}>
      <button
        type="button"
        className={`icon-btn panel-btn fb-pill tip-bottom ${panel ? 'is-active' : ''}`}
        onClick={toggle}
        aria-expanded={panel}
        aria-label={open.length ? `Feedback: ${open.length} open ${open.length === 1 ? 'note' : 'notes'}` : 'Feedback'}
        data-testid="fb-button"
      >
        <MessageCircle />
        {open.length > 0 && <span className="fb-count">{open.length}</span>}
        {fresh && <span className="fb-dot" />}
      </button>
      {panel && <FeedbackPanel palette={palette} seen={seen} />}
    </div>
  )
}

function FeedbackPanel({ palette, seen }: { palette: Palette; seen: number }) {
  const items = useFeedback((s) => s.items)
  const on = useFeedback((s) => s.on)
  const elements = useStore((s) => s.doc.elements)
  const [showResolved, setShowResolved] = useState(false)
  const byId = new Map(elements.map((e) => [e.id, e]))
  const ids = new Set(byId.keys())
  const names = namesById(items)
  const open = openNotes(items, ids).reverse().map((x) => named(x, names))
  const resolved = items.filter((x) => x.kind === 'note' && x.resolved && ids.has(x.target)).reverse().map((x) => named(x, names))
  const fresh = open.filter((n) => n.at > seen && n.by.id !== me().id).length
  const liked = new Map<string, FbPerson[]>()
  for (const x of items) if (x.kind === 'like' && ids.has(x.target)) liked.set(x.target, [...(liked.get(x.target) ?? []), named(x, names).by])
  const top = [...liked].sort((a, b) => b[1].length - a[1].length).slice(0, 3)

  const go = (target: string, note?: string) => {
    const el = byId.get(target)
    if (!el) return
    const b = getBounds(el)
    const small = window.innerWidth < 600
    // on a wide screen the list stays open: centre the item in the space beside it
    glideToBox(b, small ? 0 : 380)
    setF({ open: note ?? null, panel: small ? false : F().panel })
  }

  const row = (n: FbItem, done = false) => (
    <div key={n.id} className={`fb-row ${F().open === n.id ? 'is-on' : ''}`} data-testid="fb-row">
      <button type="button" className="fb-row-main" onClick={() => go(n.target, done ? undefined : n.id)}>
        <Avatar who={n.by} />
        <span className="fb-row-body">
          <span className="fb-row-text">{n.text}</span>
          <span className="fb-row-meta">
            <Thumb el={byId.get(n.target)} palette={palette} />
            {n.by.name} · {timeAgo(n.at)}
          </span>
        </span>
        {!done && n.at > seen && n.by.id !== me().id && <span className="fb-new" aria-label="New" />}
      </button>
      <button
        type="button"
        className="fb-tick"
        aria-label={done ? 'Reopen' : 'Resolve'}
        title={done ? 'Reopen' : 'Resolve'}
        onClick={() => resolveNote(n.id, !done)}
        data-testid={done ? 'fb-reopen' : 'fb-tick'}
      >
        {done ? <RotateCcw /> : <Check />}
      </button>
    </div>
  )

  return (
    <div className="popover popover-right fb-panel" role="dialog" aria-label="Feedback" data-testid="fb-panel">
      <div className="fb-panel-head">
        <b>Feedback</b>
        <span>{fresh ? `${fresh} new` : open.length ? `${open.length} open` : 'All caught up'}</span>
      </div>
      <div className="fb-panel-scroll">
        {open.length > 0 && <div className="fb-sec">Notes</div>}
        {open.map((n) => row(n))}
        {!open.length && <p className="fb-empty">No open notes. When people you share with leave a note, it shows up here.</p>}
        {top.length > 0 && <div className="fb-sec">Most liked</div>}
        {top.map(([id, who]) => (
          <button key={id} type="button" className="fb-liked" onClick={() => go(id)}>
            <Thumb el={byId.get(id)} palette={palette} size="md" />
            <span className="fb-row-body">
              <span className="fb-liked-name">{cap(describe(byId.get(id)!))}</span>
              <span className="fb-row-meta">{who.map((p) => p.name).join(', ')}</span>
            </span>
            <span className="fb-liked-n">
              <Heart fill="currentColor" />
              {who.length}
            </span>
          </button>
        ))}
        {showResolved && resolved.length > 0 && <div className="fb-sec">Resolved</div>}
        {showResolved && resolved.map((n) => row(n, true))}
      </div>
      <div className="fb-panel-foot">
        <label className="fb-switch-row">
          <span>Let viewers leave feedback</span>
          <input type="checkbox" className="fb-switch" checked={on} onChange={(e) => setFeedbackOn(e.target.checked)} data-testid="fb-on" />
        </label>
        {resolved.length > 0 && (
          <button type="button" className="fb-link" onClick={() => setShowResolved(!showResolved)}>
            {showResolved ? 'Hide resolved' : `Show resolved (${resolved.length})`}
          </button>
        )}
      </div>
    </div>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
