import { Link, Palette } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { addLink, addSwatch } from '../moodboard'
import { useStore } from '../store'

const HEX_RE = /^#?[0-9a-f]{6}$/i

/** Small dialogs behind the "+" menu: add a link card or a colour swatch. */
export function InsertDialog() {
  const insert = useStore((s) => s.insert)
  const setInsert = useStore((s) => s.setInsert)
  const [url, setUrl] = useState('')
  const [hex, setHex] = useState('#ff9f0a')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!insert) return
    setUrl('')
    requestAnimationFrame(() => inputRef.current?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setInsert(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [insert, setInsert])

  if (!insert) return null
  const close = () => setInsert(null)
  const normalizedHex = hex.startsWith('#') ? hex : `#${hex}`

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (insert === 'link') {
      const value = url.trim()
      if (!value) return
      close()
      void addLink(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    } else if (HEX_RE.test(hex)) {
      close()
      addSwatch(normalizedHex)
    }
  }

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <form className="dialog insert-dialog" onSubmit={submit} data-testid={`insert-dialog-${insert}`}>
        <div className="insert-head">
          {insert === 'link' ? <Link /> : <Palette />}
          <h2 className="insert-title">{insert === 'link' ? 'Add a link' : 'Add a colour'}</h2>
        </div>
        {insert === 'link' ? (
          <>
            <input
              ref={inputRef}
              className="field"
              type="url"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="Paste a link — a website, Pinterest, YouTube…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              data-testid="link-input"
            />
            <p className="insert-hint">Tip: you can also paste or drop links and images straight onto the board.</p>
          </>
        ) : (
          <div className="color-row">
            <label className="color-big" style={{ background: HEX_RE.test(hex) ? normalizedHex : '#ccc' }}>
              <input type="color" value={HEX_RE.test(hex) ? normalizedHex : '#cccccc'} onChange={(e) => setHex(e.target.value)} />
            </label>
            <input
              ref={inputRef}
              className="field"
              value={hex}
              maxLength={7}
              spellCheck={false}
              autoCapitalize="off"
              onChange={(e) => setHex(e.target.value.trim())}
              aria-label="Hex colour"
              data-testid="hex-input"
            />
          </div>
        )}
        <div className="pop-actions">
          <button type="button" className="ghost-btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="primary-btn" disabled={insert === 'link' ? !url.trim() : !HEX_RE.test(hex)} data-testid="insert-add">
            <span>Add</span>
          </button>
        </div>
      </form>
    </div>
  )
}
