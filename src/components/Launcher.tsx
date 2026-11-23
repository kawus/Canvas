import {
  ArrowUpRight,
  Circle,
  Copy,
  FileText,
  Grid2x2,
  History,
  ImagePlus,
  Keyboard,
  LayoutGrid,
  LifeBuoy,
  Link,
  MapPin,
  Maximize,
  Mic,
  MousePointer2,
  Palette,
  Pencil,
  Plus,
  Presentation,
  Search,
  Share,
  Sparkles,
  Square,
  StickyNote,
  Type,
  Focus,
  Image,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createStickyAt, createTextAt, finishEditing } from '../actions'
import { duplicateBoard, newBoard } from '../boards'
import { copyPictureNow, exportPdf, exportPng } from '../export'
import { changelogUrl, openHelp } from '../help'
import { openImagePicker } from '../images'
import { allBoards, type BoardRow } from '../library'
import { mediaOf } from '../media'
import { addLink, addSwatch, normalizeUrl } from '../moodboard'
import { parsePlace } from '../places'
import { appleKeys } from '../platform'
import { slidesOf, startPresenting } from '../slides'
import { useStore } from '../store'
import { tidySelection, tidyable } from '../tidy'

/**
 * The launcher (⌘K or /): everything Canvas does, one keystroke away, for
 * people who'd rather stay on the keyboard. Type a few letters and press
 * Enter. It also understands what you type: a link becomes a link card, a
 * colour code a swatch, and anything else a sticky note.
 */

interface Command {
  id: string
  label: string
  /** extra words it answers to */
  words?: string
  group: 'Suggested' | 'Add' | 'Board' | 'Go to' | 'Help'
  icon: ReactNode
  hint?: string
  note?: string
  run: () => void
}

const S = () => useStore.getState()
const mod = appleKeys ? '⌘' : 'Ctrl'
const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i

/** The middle of the screen, in board coordinates (where new things go). */
function centre(): [number, number] {
  const v = S().viewport
  return [(window.innerWidth / 2 - v.x) / v.zoom, (window.innerHeight / 2.2 - v.y) / v.zoom]
}

function addSticky(text = '') {
  const [x, y] = centre()
  createStickyAt(x, y, text)
}

function addText(text = '') {
  const [x, y] = centre()
  createTextAt(x, y, text)
}

function commands(boards: BoardRow[]): Command[] {
  const s = S()
  const own = !!s.doc.key
  const tool = (t: Parameters<typeof s.setTool>[0]) => () => S().setTool(t)
  const list: Command[] = []
  const add = (c: Command) => list.push(c)
  if (own) {
    add({ id: 'sticky', label: 'Add sticky note', group: 'Suggested', icon: <StickyNote />, hint: 'N', run: () => addSticky() })
    add({ id: 'text', label: 'Add text', group: 'Suggested', icon: <Type />, hint: 'T', run: () => addText() })
  }
  if (slidesOf(s.doc.elements).length) add({ id: 'present', label: 'Present', words: 'slides play show', group: 'Suggested', icon: <Presentation />, run: () => startPresenting(0) })
  const sel = s.doc.elements.filter((e) => s.selectedIds.includes(e.id))
  if (own && tidyable(sel).length >= 2) add({ id: 'tidy', label: 'Tidy up the selection', words: 'arrange neat', group: 'Suggested', icon: <LayoutGrid />, run: tidySelection })
  if (own) {
    add({ id: 'link', label: 'Link, video or music…', words: 'url youtube spotify website', group: 'Add', icon: <Link />, run: () => S().setInsert('link') })
    add({ id: 'image', label: 'Image…', words: 'photo picture', group: 'Add', icon: <ImagePlus />, hint: 'I', run: () => openImagePicker() })
    add({ id: 'colour', label: 'Colour…', words: 'swatch color hex', group: 'Add', icon: <Palette />, run: () => S().setInsert('color') })
    add({ id: 'font', label: 'Font…', words: 'typeface type', group: 'Add', icon: <Type />, run: () => S().setInsert('font') })
    add({ id: 'place', label: 'Place…', words: 'map location address venue', group: 'Add', icon: <MapPin />, run: () => S().setInsert('place') })
    add({ id: 'voice', label: 'Voice…', words: 'record audio note microphone', group: 'Add', icon: <Mic />, run: () => S().setInsert('voice') })
    add({ id: 'rect', label: 'Rectangle', words: 'shape box', group: 'Add', icon: <Square />, hint: 'R', run: tool('rect') })
    add({ id: 'ellipse', label: 'Ellipse', words: 'shape circle', group: 'Add', icon: <Circle />, hint: 'O', run: tool('ellipse') })
    add({ id: 'arrow', label: 'Arrow', words: 'connector line', group: 'Add', icon: <ArrowUpRight />, hint: 'A', run: tool('arrow') })
    add({ id: 'pen', label: 'Draw with the pen', words: 'pencil sketch', group: 'Add', icon: <Pencil />, hint: 'P', run: tool('pen') })
    add({ id: 'select', label: 'Select', words: 'pointer move', group: 'Add', icon: <MousePointer2 />, hint: 'V', run: tool('select') })
  }
  add({ id: 'share', label: 'Share…', words: 'link invite feedback', group: 'Board', icon: <Share />, run: () => (document.querySelector('[data-testid=share]') as HTMLElement | null)?.click() })
  const content = s.doc.elements.filter((e) => e.type !== 'slide')
  if (content.length) {
    add({ id: 'pdf', label: 'Export as PDF', words: 'download save print', group: 'Board', icon: <FileText />, run: () => void exportPdf(S().doc.elements, S().doc.title) })
    add({ id: 'png', label: 'Export as image', words: 'download save png picture', group: 'Board', icon: <Image />, run: () => void exportPng(S().doc.elements, S().doc.title) })
    add({ id: 'copy-picture', label: 'Copy as picture', words: 'clipboard image png paste screenshot', group: 'Board', icon: <Image />, run: () => copyPictureNow() })
  }
  add({ id: 'fit', label: 'Zoom to fit', words: 'whole board overview', group: 'Board', icon: <Maximize />, hint: '⇧ 1', run: () => S().zoomToFit() })
  add({ id: 'focus', label: 'Focus mode', words: 'hide tools distraction', group: 'Board', icon: <Focus />, hint: 'F', run: () => S().setFocus(true) })
  if (own && s.cloud) add({ id: 'versions', label: 'Earlier versions', words: 'history restore undo', group: 'Board', icon: <History />, run: () => S().setVersionsOpen(true) })
  add({ id: 'new', label: 'New board', words: 'blank create', group: 'Board', icon: <Plus />, run: () => void newBoard() })
  if (own) add({ id: 'duplicate', label: 'Duplicate board', words: 'copy', group: 'Board', icon: <Copy />, run: () => void duplicateBoard() })
  for (const b of boards.filter((b) => b.id !== s.doc.id).slice(0, 8)) {
    add({ id: `board-${b.id}`, label: b.title || 'Untitled', words: 'board open go', group: 'Go to', icon: <Grid2x2 />, note: when(b.updatedAt), run: () => (location.hash = `#${b.id}`) })
  }
  add({ id: 'keys', label: 'Keyboard shortcuts', words: 'keys help', group: 'Help', icon: <Keyboard />, hint: '?', run: () => S().setPanel('keys') })
  add({ id: 'help', label: 'Help centre', words: 'support questions', group: 'Help', icon: <LifeBuoy />, run: () => openHelp() })
  add({ id: 'news', label: 'What’s new', words: 'changelog updates ideas', group: 'Help', icon: <Sparkles />, run: () => window.open(changelogUrl(), '_blank', 'noopener') })
  return list
}

function when(t: number) {
  const days = Math.floor((Date.now() - t) / 864e5)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 7 ? `${days} days ago` : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** How well a command matches what's typed (0: not at all). */
function score(c: Command, q: string) {
  const label = c.label.toLowerCase()
  const all = `${label} ${c.words ?? ''}`
  const words = q.split(/\s+/).filter(Boolean)
  if (!words.every((w) => all.includes(w))) return 0
  if (label.startsWith(q)) return 3
  if (label.split(/\s+/).some((w) => w.startsWith(words[0]))) return 2
  return 1
}

/** What the typed text itself could become (a link, a colour, a note). */
function fromText(q: string): Command[] {
  const t = q.trim()
  if (!t || !S().doc.key) return []
  const url = /\s/.test(t) ? null : normalizeUrl(t)
  if (url && /\.|:/.test(t)) {
    const media = mediaOf(url)
    const spot = parsePlace(url)
    const note = spot ? `${spot.service} place` : media ? `${media.service} · plays on the board` : 'link card'
    return [{ id: 'paste-link', label: 'Add link', group: 'Suggested', icon: <Link />, note, hint: '↵', run: () => void addLink(url) }]
  }
  if (HEX.test(t)) {
    const hex = t.startsWith('#') ? t : `#${t}`
    return [{ id: 'paste-hex', label: 'Add colour', group: 'Suggested', icon: <Palette />, note: hex.toUpperCase(), hint: '↵', run: () => addSwatch(hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex) }]
  }
  return []
}

export function Launcher() {
  const open = useStore((s) => s.launcher)
  if (!open) return null
  return <LauncherOpen />
}

function LauncherOpen() {
  const close = () => S().setLauncher(false)
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const [boards, setBoards] = useState<BoardRow[]>([])
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // a note being typed is finished first, so the launcher gets every key
    if (S().editingId) finishEditing()
    input.current?.focus()
    void allBoards().then(setBoards).catch(() => {})
  }, [])

  const all = useMemo(() => commands(boards), [boards])
  const query = q.trim().toLowerCase()
  const shown = useMemo(() => {
    if (!query) return all.filter((c) => c.group !== 'Go to' || all.filter((x) => x.group === 'Go to').indexOf(c) < 3)
    const typed = fromText(q)
    const hits = all
      .map((c) => ({ c, s: score(c, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c)
    // nothing matches: the words become a sticky note (or text)
    const note: Command[] =
      !typed.length && !hits.length && S().doc.key && q.trim().length > 1
        ? [
            { id: 'note', label: 'Add sticky note', group: 'Suggested', icon: <StickyNote />, note: `“${q.trim()}”`, hint: '↵', run: () => addSticky(q.trim()) },
            { id: 'note-text', label: 'Add as text', group: 'Suggested', icon: <Type />, note: `“${q.trim()}”`, run: () => addText(q.trim()) },
          ]
        : []
    return [...typed, ...hits.slice(0, 9), ...note]
  }, [all, q, query])

  const pick = Math.min(at, Math.max(shown.length - 1, 0))
  const run = (c: Command | undefined) => {
    if (!c) return
    close()
    // after the launcher has gone, so dialogs and edits get the keyboard
    requestAnimationFrame(() => c.run())
  }

  useEffect(() => {
    list.current?.querySelector('.launch-row.is-on')?.scrollIntoView({ block: 'nearest' })
  }, [pick, q])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAt((pick + 1) % Math.max(shown.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAt((pick - 1 + shown.length) % Math.max(shown.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(shown[pick])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  let lastGroup = ''
  return (
    <div className="launch-back" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="launch panel" role="dialog" aria-label="Launcher" data-testid="launcher">
        <div className="launch-in">
          <Search aria-hidden />
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setAt(0)
            }}
            onKeyDown={onKey}
            placeholder="Type a command, a link or a note…"
            aria-label="Command"
            spellCheck={false}
            autoComplete="off"
            data-testid="launcher-input"
          />
          <kbd>esc</kbd>
        </div>
        <div className="launch-list" ref={list} role="listbox">
          {shown.map((c, i) => {
            const head = !query && c.group !== lastGroup ? c.group : null
            lastGroup = c.group
            return (
              <div key={c.id}>
                {head && <p className="launch-group">{head}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === pick}
                  className={`launch-row ${i === pick ? 'is-on' : ''}`}
                  onPointerMove={() => i !== pick && setAt(i)}
                  onClick={() => run(c)}
                  data-testid="launcher-row"
                >
                  {c.icon}
                  <span className="launch-label">
                    {c.label}
                    {c.note && <em>{c.note}</em>}
                  </span>
                  {c.hint && (
                    <span className="launch-keys">
                      {c.hint.split(' ').map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </span>
                  )}
                </button>
              </div>
            )
          })}
          {!shown.length && <p className="launch-empty">Nothing by that name.</p>}
        </div>
        <div className="launch-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> choose
          </span>
          <span>
            <kbd>↵</kbd> do it
          </span>
          <span>
            <kbd>{mod}K</kbd> or <kbd>/</kbd> anywhere
          </span>
        </div>
      </div>
    </div>
  )
}
