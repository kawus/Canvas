import { Search, Type } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { FONTS, fontFamily, loadFont, type FontCategory } from '../fonts'
import { addFont } from '../moodboard'
import { useStore } from '../store'

const ORDER: FontCategory[] = ['Sans serif', 'Serif', 'Display', 'Mono', 'Handwriting']

/** + → Font: pick a typeface for a font card, each name shown in its own font. */
export function FontPicker() {
  const open = useStore((s) => s.insert === 'font')
  if (!open) return null
  return <FontPickerOpen />
}

function FontPickerOpen() {
  const close = () => useStore.getState().setInsert(null)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [sample, setSample] = useState('')
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // the names show in their own fonts (each file is small, and only loads here)
    for (const f of FONTS) void loadFont(f.id)
    requestAnimationFrame(() => search.current?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const q = query.trim().toLowerCase()
  const shown = FONTS.filter((f) => !q || f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q))
  const add = (id = picked) => {
    if (!id) return
    close()
    addFont(id, sample)
  }

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <form
        className="dialog insert-dialog font-dialog"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        data-testid="font-dialog"
      >
        <div className="insert-head">
          <Type />
          <h2 className="insert-title">Add a font</h2>
        </div>
        <label className="font-search">
          <Search aria-hidden />
          <input ref={search} className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search fonts" aria-label="Search fonts" data-testid="font-search" />
        </label>
        <div className="font-list" role="listbox" aria-label="Fonts">
          {ORDER.map((cat) => {
            const fonts = shown.filter((f) => f.category === cat)
            if (!fonts.length) return null
            return (
              <div key={cat}>
                <p className="font-cat">{cat}</p>
                {fonts.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="option"
                    aria-selected={picked === f.id}
                    className={`font-row ${picked === f.id ? 'is-on' : ''}`}
                    onClick={() => setPicked(f.id)}
                    onDoubleClick={() => add(f.id)}
                    data-testid="font-row"
                  >
                    <span style={{ fontFamily: `${fontFamily(f.id)}, system-ui` }}>{f.name}</span>
                  </button>
                ))}
              </div>
            )
          })}
          {!shown.length && <p className="insert-hint">No font by that name. There are 30 to choose from.</p>}
        </div>
        <input
          className="field font-sample"
          value={sample}
          maxLength={120}
          onChange={(e) => setSample(e.target.value)}
          placeholder="Sample text (optional)"
          aria-label="Sample text"
          style={picked ? { fontFamily: `${fontFamily(picked)}, system-ui` } : undefined}
          data-testid="font-sample"
        />
        <div className="pop-actions">
          <button type="button" className="ghost-btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="primary-btn" disabled={!picked} data-testid="font-add">
            <span>Add</span>
          </button>
        </div>
      </form>
    </div>
  )
}
