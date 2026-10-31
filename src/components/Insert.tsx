import { Link, Palette } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { addLink, addSwatch, normalizeUrl } from '../moodboard'
import { useStore } from '../store'

const HEX_RE = /^#?[0-9a-f]{6}$/i

/** Small dialogs behind the "+" menu: add a link card or a colour swatch. */
export function InsertDialog() {
  const insert = useStore((s) => s.insert)
  const setInsert = useStore((s) => s.setInsert)
  const [url, setUrl] = useState('')
  const [hex, setHex] = useState('#ff9f0a')
  const [urlError, setUrlError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!insert) return
    setUrl('')
    setUrlError(false)
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
      // people type "apple.com": the https:// is added for them
      const full = normalizeUrl(url)
      if (!full) {
        setUrlError(true)
        return
      }
      close()
      void addLink(full)
    } else if (HEX_RE.test(hex)) {
      close()
      addSwatch(normalizedHex)
    }
  }

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <form className="dialog insert-dialog" noValidate onSubmit={submit} data-testid={`insert-dialog-${insert}`}>
        <div className="insert-head">
          {insert === 'link' ? <Link /> : <Palette />}
          <h2 className="insert-title">{insert === 'link' ? 'Add a link' : 'Add a colour'}</h2>
        </div>
        {insert === 'link' ? (
          <>
            <input
              ref={inputRef}
              className="field"
              type="text"
              inputMode="url"
              autoComplete="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              placeholder="apple.com, a Pinterest pin, a YouTube video…"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setUrlError(false)
              }}
              aria-invalid={urlError}
              data-testid="link-input"
            />
            {urlError ? (
              <p className="insert-hint is-error" data-testid="link-error">
                That doesn’t look like a web address — try something like apple.com
              </p>
            ) : (
              <p className="insert-hint">Type or paste a web address. You can also paste or drop links and images straight onto the board.</p>
            )}
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
