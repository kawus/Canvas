import { finishEditing, isEditable, registerEditor, updateEditingText } from '../actions'
import { FONT_STACK, LINE_HEIGHT, STICKY_INK, type Palette } from '../constants'
import { toScreen } from '../handles'
import { boxTextLayout } from '../layout'
import { labelColor } from '../render'
import { useStore } from '../store'
import { measureText } from '../textMetrics'
import type { CSSProperties } from 'react'

export function TextEditor({ palette }: { palette: Palette }) {
  const editingId = useStore((s) => s.editingId)
  const el = useStore((s) => s.doc.elements.find((e) => e.id === s.editingId))
  const v = useStore((s) => s.viewport)

  if (!editingId || !isEditable(el)) return null

  let style: CSSProperties
  let placeholder = 'Type something'
  if (el.type === 'text') {
    // Free text: grows with its content from the top-left corner
    const [x, y] = toScreen(v, el.x, el.y)
    const fs = el.fontSize * v.zoom
    const m = measureText(el.text, el.fontSize)
    style = {
      left: x,
      top: y,
      width: el.text ? m.width * v.zoom + fs * 1.5 : fs * 8,
      height: Math.max(m.height, el.fontSize * LINE_HEIGHT) * v.zoom,
      fontSize: fs,
      color: palette[el.color],
    }
  } else {
    // Sticky / shape label: centred and wrapped inside the element, mirroring boxTextLayout
    const l = boxTextLayout(el)
    const [x, y] = toScreen(v, l.inner.x, l.top)
    const lh = l.fontSize * LINE_HEIGHT
    const color = el.type === 'sticky' ? STICKY_INK : labelColor(el, palette)
    style = {
      left: x,
      top: y,
      width: l.inner.w * v.zoom,
      height: Math.max(l.height, lh) * v.zoom,
      fontSize: l.fontSize * v.zoom,
      color,
      textAlign: 'center',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
    }
    placeholder = el.type === 'sticky' ? 'Write a note' : 'Add a label'
  }

  return (
    <textarea
      key={editingId}
      ref={registerEditor}
      className="text-editor"
      data-testid="text-editor"
      value={el.text ?? ''}
      spellCheck={false}
      autoCapitalize="sentences"
      autoComplete="off"
      placeholder={placeholder}
      wrap={el.type === 'text' ? 'off' : 'soft'}
      style={{ ...style, lineHeight: LINE_HEIGHT, fontFamily: FONT_STACK }}
      onChange={(e) => updateEditingText(e.target.value)}
      onBlur={() => finishEditing()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault()
          finishEditing()
        }
      }}
    />
  )
}
