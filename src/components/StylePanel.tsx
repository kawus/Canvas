import { BringToFront, Copy, SendToBack, Trash2 } from 'lucide-react'
import { bringToFront, duplicateSelection, sendToBack } from '../actions'
import { COLOR_KEYS, COLOR_NAMES, FONT_SIZE, STICKY_FILL, type Palette } from '../constants'
import { selectedElements, useStore } from '../store'
import type { ElType, FillKey, FontSizeKey, SizeKey, Style } from '../types'
import { IconButton } from './ui'

const SIZES: { key: SizeKey; label: string; dot: number }[] = [
  { key: 's', label: 'Thin', dot: 4 },
  { key: 'm', label: 'Medium', dot: 7 },
  { key: 'l', label: 'Bold', dot: 11 },
]
const FILLS: { key: FillKey; label: string }[] = [
  { key: 'none', label: 'No fill' },
  { key: 'tint', label: 'Light fill' },
  { key: 'solid', label: 'Solid fill' },
]
const FONTS: { key: FontSizeKey; label: string }[] = [
  { key: 's', label: 'S' },
  { key: 'm', label: 'M' },
  { key: 'l', label: 'L' },
  { key: 'xl', label: 'XL' },
]

const TOOL_TYPE: Partial<Record<string, ElType>> = {
  pen: 'freedraw',
  rect: 'rect',
  ellipse: 'ellipse',
  arrow: 'arrow',
  line: 'line',
  text: 'text',
  sticky: 'sticky',
}

export function StylePanel({ palette }: { palette: Palette }) {
  const tool = useStore((s) => s.tool)
  const style = useStore((s) => s.style)
  const setStyle = useStore((s) => s.setStyle)
  const doc = useStore((s) => s.doc)
  const selectedIds = useStore((s) => s.selectedIds)
  const editingId = useStore((s) => s.editingId)
  const deleteSelected = useStore((s) => s.deleteSelected)
  const busy = useStore((s) => !!s.draft || !!s.marquee)

  const sel = selectedElements({ doc, selectedIds })
  let types: ElType[]
  let current: Style = style
  let hasLabel = false
  if (sel.length) {
    types = [...new Set(sel.map((e) => e.type))]
    hasLabel = sel.some((e) => (e.type === 'rect' || e.type === 'ellipse') && !!e.text)
    const first = sel.find((e) => e.type !== 'image') ?? sel[0]
    const firstFont = 'fontSize' in first ? first.fontSize : undefined
    const fontKey = (Object.keys(FONT_SIZE) as FontSizeKey[]).find((k) => FONT_SIZE[k] === firstFont)
    current = {
      color: first.color,
      stickyColor: first.color,
      size: 'size' in first ? first.size : style.size,
      fill: first.type === 'rect' || first.type === 'ellipse' ? first.fill : style.fill,
      fontSize: fontKey ?? (firstFont ? ('' as FontSizeKey) : style.fontSize),
    }
  } else if (TOOL_TYPE[tool]) {
    types = [TOOL_TYPE[tool]!]
  } else {
    return null
  }
  if (busy || editingId) return null

  // Sticky notes use paper colours; everything else uses ink colours.
  const stickyOnly = types.every((t) => t === 'sticky')
  const showColor = types.some((t) => t !== 'image')
  const showSize = types.some((t) => t === 'freedraw' || t === 'rect' || t === 'ellipse' || t === 'arrow' || t === 'line')
  const showFill = types.some((t) => t === 'rect' || t === 'ellipse')
  const showFont = types.includes('text') || types.includes('sticky') || hasLabel
  const showActions = sel.length > 0
  const swatch = stickyOnly ? STICKY_FILL : palette
  const activeColor = stickyOnly ? current.stickyColor : current.color

  return (
    <div className="style-panel panel" data-testid="style-panel" onPointerDown={(e) => e.preventDefault()}>
      {showColor && (
      <div className="swatches" role="radiogroup" aria-label="Color">
        {COLOR_KEYS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={activeColor === c}
            aria-label={COLOR_NAMES[c]}
            title={COLOR_NAMES[c]}
            className={`swatch ${activeColor === c ? 'is-active' : ''}`}
            style={{ ['--swatch' as string]: swatch[c] }}
            onClick={() => setStyle(stickyOnly ? { stickyColor: c } : { color: c })}
            data-testid={`color-${c}`}
          />
        ))}
      </div>
      )}

      {showSize && (
        <>
          <span className="sep" />
          <div className="seg" role="radiogroup" aria-label="Stroke">
            {SIZES.map((s) => (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={current.size === s.key}
                aria-label={s.label}
                title={s.label}
                className={`seg-btn ${current.size === s.key ? 'is-active' : ''}`}
                onClick={() => setStyle({ size: s.key })}
              >
                <span className="size-dot" style={{ width: s.dot, height: s.dot }} />
              </button>
            ))}
          </div>
        </>
      )}

      {showFill && (
        <>
          <span className="sep" />
          <div className="seg" role="radiogroup" aria-label="Fill">
            {FILLS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={current.fill === f.key}
                aria-label={f.label}
                title={f.label}
                className={`seg-btn ${current.fill === f.key ? 'is-active' : ''}`}
                onClick={() => setStyle({ fill: f.key })}
                data-testid={`fill-${f.key}`}
              >
                <span className={`fill-icon fill-${f.key}`} />
              </button>
            ))}
          </div>
        </>
      )}

      {showFont && (
        <>
          <span className="sep" />
          <div className="seg" role="radiogroup" aria-label="Text size">
            {FONTS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={current.fontSize === f.key}
                aria-label={`Text size ${f.label}`}
                className={`seg-btn seg-text ${current.fontSize === f.key ? 'is-active' : ''}`}
                onClick={() => setStyle({ fontSize: f.key })}
              >
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}

      {showActions && (
        <>
          {showColor && <span className="sep" />}
          <div className="seg">
            <IconButton label="Duplicate" kbd="⌘D" onClick={duplicateSelection} className="small">
              <Copy />
            </IconButton>
            <IconButton label="Bring to front" kbd="]" onClick={bringToFront} className="small">
              <BringToFront />
            </IconButton>
            <IconButton label="Send to back" kbd="[" onClick={sendToBack} className="small">
              <SendToBack />
            </IconButton>
            <IconButton label="Delete" kbd="⌫" onClick={deleteSelected} className="small" testId="delete">
              <Trash2 />
            </IconButton>
          </div>
        </>
      )}
    </div>
  )
}
