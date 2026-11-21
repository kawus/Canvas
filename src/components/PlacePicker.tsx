import { MapPin } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { addLink, addPlace, normalizeUrl } from '../moodboard'
import { parsePlace } from '../places'
import { useStore } from '../store'

interface Found {
  lat: number
  lng: number
  name: string
  address: string
}

/** + → Place: find a place by name (or paste a maps link) for a place card with a map. */
export function PlacePicker() {
  const open = useStore((s) => s.insert === 'place')
  if (!open) return null
  return <PlacePickerOpen />
}

function PlacePickerOpen() {
  const close = () => useStore.getState().setInsert(null)
  const [text, setText] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [state, setState] = useState<'idle' | 'searching' | 'none' | 'offline'>('idle')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => input.current?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const link = normalizeUrl(text)
  const isMapsLink = !!link && !!parsePlace(link)

  const add = (f: Found) => {
    close()
    void addPlace({ service: 'Google Maps', name: f.name, lat: f.lat, lng: f.lng }, `https://www.google.com/maps/place/${encodeURIComponent(f.name)}/@${f.lat},${f.lng},17z`)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = text.trim()
    if (!q) return
    if (isMapsLink && link) {
      close()
      void addLink(link)
      return
    }
    // the same search pressed again: add what was found
    if (found && state === 'idle') return add(found)
    setState('searching')
    try {
      const res = await fetch(`api/unfurl?place=1&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(12000) })
      const d = res.ok ? ((await res.json()) as Partial<Found> & { error?: string }) : null
      if (d && !d.error && Number.isFinite(d.lat)) {
        setFound({ lat: d.lat!, lng: d.lng!, name: d.name || q, address: d.address || '' })
        setState('idle')
      } else {
        setFound(null)
        setState(res.ok ? 'none' : 'offline')
      }
    } catch {
      setFound(null)
      setState('offline')
    }
  }

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <form className="dialog insert-dialog" noValidate onSubmit={(e) => void submit(e)} data-testid="place-dialog">
        <div className="insert-head">
          <MapPin />
          <h2 className="insert-title">Add a place</h2>
        </div>
        <input
          ref={input}
          className="field"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setFound(null)
            setState('idle')
          }}
          placeholder="A place, like Tate Modern London"
          aria-label="Place name or maps link"
          autoComplete="off"
          enterKeyHint="search"
          data-testid="place-input"
        />
        {found ? (
          <button type="button" className="place-found" onClick={() => add(found)} data-testid="place-found">
            <MapPin />
            <span>
              <b>{found.name}</b>
              {found.address && <small>{found.address}</small>}
            </span>
          </button>
        ) : (
          <p className={`insert-hint ${state === 'none' || state === 'offline' ? 'is-error' : ''}`}>
            {isMapsLink
              ? 'A maps link · it becomes a live map on the board'
              : state === 'searching'
                ? 'Looking it up…'
                : state === 'none'
                  ? 'Couldn’t find that place. Try adding the city or country.'
                  : state === 'offline'
                    ? 'Couldn’t look it up just now. Check your connection and try again.'
                    : 'Type a name and press Search, or paste a Google Maps or Apple Maps link.'}
          </p>
        )}
        <div className="pop-actions">
          <button type="button" className="ghost-btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="primary-btn" disabled={!text.trim() || state === 'searching'} data-testid="place-go">
            <span>{found || isMapsLink ? 'Add' : 'Search'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}
