import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  BringToFront,
  Copy,
  Crop,
  LayoutDashboard,
  Ellipsis,
  ExternalLink,
  Palette as PaletteIcon,
  SendToBack,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { alignSelection, bringToFront, distributeSelection, duplicateSelection, sendToBack, type AlignMode } from '../actions'
import { COLOR_KEYS, COLOR_NAMES, FONT_SIZE, STICKY_FILL, type Palette } from '../constants'
import { openLink } from '../controller'
import { startCrop } from '../crop'
import { extractPalette } from '../moodboard'
import { selectedElements, useStore } from '../store'
import { tidySelection, tidyable } from '../tidy'
import type { El, ElType, FillKey, FontSizeKey, SizeKey, Style } from '../types'
import { IconButton, usePopover } from './ui'

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
const ALIGN: { mode: AlignMode; label: string; kbd: string; icon: ReactNode }[] = [
  { mode: 'left', label: 'Align left', kbd: '⌥A', icon: <AlignStartVertical /> },
  { mode: 'hcenter', label: 'Align centre', kbd: '⌥H', icon: <AlignCenterVertical /> },
  { mode: 'right', label: 'Align right', kbd: '⌥D', icon: <AlignEndVertical /> },
  { mode: 'top', label: 'Align top', kbd: '⌥W', icon: <AlignStartHorizontal /> },
  { mode: 'vcenter', label: 'Align middle', kbd: '⌥V', icon: <AlignCenterHorizontal /> },
  { mode: 'bottom', label: 'Align bottom', kbd: '⌥S', icon: <AlignEndHorizontal /> },
]

const TOOL_TYPE: Partial<Record<string, ElType>> = {
  pen: 'freedraw',
  highlighter: 'freedraw',
  rect: 'rect',
  ellipse: 'ellipse',
  arrow: 'arrow',
  line: 'line',
  text: 'text',
  sticky: 'sticky',
}

type Pop = 'color' | 'size' | 'fill' | 'font' | 'align' | 'more'
type ColorField = 'color' | 'stickyColor' | 'highlightColor'

const hasInk = (e: El) => e.type !== 'image' && e.type !== 'link' && e.type !== 'swatch'
const isHighlight = (e: El) => e.type === 'freedraw' && !!e.highlight

/**
 * Compact, contextual style bar (FigJam-like): one button per property, each
 * opening a small menu above, so it fits on a phone.
 */
export function StylePanel({ palette }: { palette: Palette }) {
  const tool = useStore((s) => s.tool)
  const style = useStore((s) => s.style)
  const setStyle = useStore((s) => s.setStyle)
  const doc = useStore((s) => s.doc)
  const selectedIds = useStore((s) => s.selectedIds)
  const editingId = useStore((s) => s.editingId)
  const deleteSelected = useStore((s) => s.deleteSelected)
  const busy = useStore((s) => !!s.draft || !!s.marquee)
  const { open, setOpen, ref } = usePopover()
  const [which, setWhich] = useState<Pop>('color')
  const pop = open ? which : null
  const toggle = (p: Pop) => {
    if (open && which === p) setOpen(false)
    else {
      setWhich(p)
      setOpen(true)
    }
  }

  const sel = selectedElements({ doc, selectedIds })
  let types: ElType[]
  let current: Style = style
  let colorField: ColorField = 'color'
  let hasLabel = false
  if (sel.length) {
    types = [...new Set(sel.map((e) => e.type))]
    hasLabel = sel.some((e) => (e.type === 'rect' || e.type === 'ellipse') && !!e.text)
    const first = sel.find(hasInk) ?? sel[0]
    const firstFont = 'fontSize' in first ? first.fontSize : undefined
    const fontKey = (Object.keys(FONT_SIZE) as FontSizeKey[]).find((k) => FONT_SIZE[k] === firstFont)
    current = {
      ...style,
      color: first.color,
      stickyColor: first.color,
      highlightColor: first.color,
      size: 'size' in first ? first.size : style.size,
      fill: first.type === 'rect' || first.type === 'ellipse' ? first.fill : style.fill,
      fontSize: fontKey ?? (firstFont ? ('' as FontSizeKey) : style.fontSize),
    }
    const inked = sel.filter(hasInk)
    if (inked.length && inked.every((e) => e.type === 'sticky')) colorField = 'stickyColor'
    else if (inked.length && inked.every(isHighlight)) colorField = 'highlightColor'
  } else if (TOOL_TYPE[tool]) {
    types = [TOOL_TYPE[tool]!]
    if (tool === 'sticky') colorField = 'stickyColor'
    if (tool === 'highlighter') colorField = 'highlightColor'
  } else {
    return null
  }
  if (busy || editingId) return null

  const showColor = sel.length ? sel.some(hasInk) : true
  const showSize = types.some((t) => t === 'freedraw' || t === 'rect' || t === 'ellipse' || t === 'arrow' || t === 'line')
  const showFill = types.some((t) => t === 'rect' || t === 'ellipse')
  const showFont = types.includes('text') || types.includes('sticky') || hasLabel
  const showActions = sel.length > 0
  // connected arrows follow their shapes, so they don't count as alignable
  const tidyCount = tidyable(sel).length
  const alignable = sel.filter((e) => !((e.type === 'arrow' || e.type === 'line') && (e.start || e.end))).length
  const single = sel.length === 1 ? sel[0] : null
  const swatches = colorField === 'stickyColor' ? STICKY_FILL : palette
  const activeColor = current[colorField]
  const swatchEls = sel.filter((e) => e.type === 'swatch')

  return (
    <div className="style-wrap" ref={ref}>
      {pop && (
        <div className={`style-pop panel pop-${pop}`} data-testid={`pop-${pop}`} onPointerDown={(e) => e.preventDefault()}>
          {pop === 'color' &&
            COLOR_KEYS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={COLOR_NAMES[c]}
                title={COLOR_NAMES[c]}
                className={`swatch ${activeColor === c ? 'is-active' : ''}`}
                style={{ ['--swatch' as string]: swatches[c] }}
                onClick={() => setStyle({ [colorField]: c })}
                data-testid={`color-${c}`}
              />
            ))}
          {pop === 'size' &&
            SIZES.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-label={s.label}
                title={s.label}
                className={`seg-btn ${current.size === s.key ? 'is-active' : ''}`}
                onClick={() => setStyle({ size: s.key })}
              >
                <span className="size-dot" style={{ width: s.dot, height: s.dot }} />
              </button>
            ))}
          {pop === 'fill' &&
            FILLS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-label={f.label}
                title={f.label}
                className={`seg-btn ${current.fill === f.key ? 'is-active' : ''}`}
                onClick={() => setStyle({ fill: f.key })}
                data-testid={`fill-${f.key}`}
              >
                <span className={`fill-icon fill-${f.key}`} />
              </button>
            ))}
          {pop === 'font' &&
            FONTS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-label={`Text size ${f.label}`}
                className={`seg-btn seg-text ${current.fontSize === f.key ? 'is-active' : ''}`}
                onClick={() => setStyle({ fontSize: f.key })}
                data-testid={`font-${f.key}`}
              >
                {f.label}
              </button>
            ))}
          {pop === 'align' && (
            <>
              {ALIGN.map((a) => (
                <IconButton key={a.mode} label={a.label} kbd={a.kbd} onClick={() => alignSelection(a.mode)} className="small" testId={`align-${a.mode}`}>
                  {a.icon}
                </IconButton>
              ))}
              <span className="sep" />
              <IconButton label="Space evenly across" kbd="⇧⌥H" disabled={alignable < 3} onClick={() => distributeSelection('x')} className="small" testId="distribute-x">
                <AlignHorizontalSpaceAround />
              </IconButton>
              <IconButton label="Space evenly down" kbd="⇧⌥V" disabled={alignable < 3} onClick={() => distributeSelection('y')} className="small" testId="distribute-y">
                <AlignVerticalSpaceAround />
              </IconButton>
            </>
          )}
          {pop === 'more' && (
            <div className="pop-menu">
              <button type="button" className="menu-item" onClick={() => { duplicateSelection(); setOpen(false) }} data-testid="duplicate-sel">
                <span className="menu-icon"><Copy /></span>
                <span className="menu-label">Duplicate</span>
                <span className="menu-hint">⌘D</span>
              </button>
              <button type="button" className="menu-item" onClick={() => { bringToFront(); setOpen(false) }}>
                <span className="menu-icon"><BringToFront /></span>
                <span className="menu-label">Bring to front</span>
                <span className="menu-hint">]</span>
              </button>
              <button type="button" className="menu-item" onClick={() => { sendToBack(); setOpen(false) }}>
                <span className="menu-icon"><SendToBack /></span>
                <span className="menu-label">Send to back</span>
                <span className="menu-hint">[</span>
              </button>
            </div>
          )}
        </div>
      )}

      <div className="style-panel panel" data-testid="style-panel" onPointerDown={(e) => e.preventDefault()}>
        {showColor && (
          <button
            type="button"
            className={`prop-btn ${pop === 'color' ? 'is-open' : ''}`}
            aria-label="Colour"
            title="Colour"
            onClick={() => toggle('color')}
            data-testid="prop-color"
          >
            <span className="color-dot" style={{ background: swatches[activeColor] }} />
          </button>
        )}
        {swatchEls.length > 0 && <SwatchColor els={swatchEls} />}
        {showSize && (
          <button type="button" className={`prop-btn ${pop === 'size' ? 'is-open' : ''}`} aria-label="Stroke" title="Stroke" onClick={() => toggle('size')} data-testid="prop-size">
            <span className="size-dot" style={{ width: SIZES.find((s) => s.key === current.size)?.dot ?? 7, height: SIZES.find((s) => s.key === current.size)?.dot ?? 7 }} />
          </button>
        )}
        {showFill && (
          <button type="button" className={`prop-btn ${pop === 'fill' ? 'is-open' : ''}`} aria-label="Fill" title="Fill" onClick={() => toggle('fill')} data-testid="prop-fill">
            <span className={`fill-icon fill-${current.fill}`} />
          </button>
        )}
        {showFont && (
          <button type="button" className={`prop-btn prop-text ${pop === 'font' ? 'is-open' : ''}`} aria-label="Text size" title="Text size" onClick={() => toggle('font')} data-testid="prop-font">
            Aa
          </button>
        )}
        {single?.type === 'link' && (
          <IconButton label="Open link" onClick={() => openLink(single.url)} className="small" testId="open-link">
            <ExternalLink />
          </IconButton>
        )}
        {single?.type === 'image' && (
          <IconButton label="Crop" kbd="↵" onClick={() => startCrop(single.id)} className="small" testId="crop-image">
            <Crop />
          </IconButton>
        )}
        {single?.type === 'image' && (
          <IconButton label="Colour palette from image" onClick={() => void extractPalette(single)} className="small" testId="extract-palette">
            <PaletteIcon />
          </IconButton>
        )}
        {showActions && (
          <>
            <span className="sep" />
            {tidyCount >= 2 && (
              <button type="button" className="prop-btn tidy-btn" onClick={tidySelection} title="Arrange neatly" data-testid="tidy">
                <LayoutDashboard />
                <span>Tidy up</span>
              </button>
            )}
            {alignable >= 2 && (
              <IconButton label="Align" active={pop === 'align'} onClick={() => toggle('align')} className="small" testId="align">
                <AlignCenterVertical />
              </IconButton>
            )}
            <IconButton label="More" active={pop === 'more'} onClick={() => toggle('more')} className="small" testId="more">
              <Ellipsis />
            </IconButton>
            <IconButton label="Delete" kbd="⌫" onClick={deleteSelected} className="small" testId="delete">
              <Trash2 />
            </IconButton>
          </>
        )}
      </div>
    </div>
  )
}

/** Colour picker for swatch cards (any colour, not just the palette). */
function SwatchColor({ els }: { els: El[] }) {
  const input = useRef<HTMLInputElement>(null)
  const before = useRef<El[] | null>(null)
  const hex = els[0].type === 'swatch' ? els[0].hex : '#000000'
  const idKey = els.map((e) => e.id).join(',')

  // live preview while picking; one undo step when the picker is done ("change")
  useEffect(() => {
    const el = input.current
    if (!el) return
    const ids = new Set(idKey.split(','))
    const onInput = () => {
      const s = useStore.getState()
      before.current ??= s.doc.elements
      s.setElementsLive(s.doc.elements.map((e) => (ids.has(e.id) && e.type === 'swatch' ? { ...e, hex: el.value } : e)))
    }
    const onChange = () => {
      onInput()
      const s = useStore.getState()
      if (before.current) s.commit(s.doc.elements, before.current)
      before.current = null
    }
    el.addEventListener('input', onInput)
    el.addEventListener('change', onChange)
    return () => {
      el.removeEventListener('input', onInput)
      el.removeEventListener('change', onChange)
    }
  }, [idKey])

  return (
    <label className="prop-btn swatch-input" title="Pick colour" data-testid="swatch-color" onPointerDown={(e) => e.stopPropagation()}>
      <span className="color-dot" style={{ background: hex }} />
      <input ref={input} type="color" defaultValue={hex} key={idKey} />
    </label>
  )
}
