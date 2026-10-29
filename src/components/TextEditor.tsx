import { finishEditing, registerEditor, updateEditingText } from '../actions'
import { FONT_STACK, LINE_HEIGHT, type Palette } from '../constants'
import { toScreen } from '../handles'
import { useStore } from '../store'
import { measureText } from '../textMetrics'
import type { TextEl } from '../types'

export function TextEditor({ palette }: { palette: Palette }) {
  const editingId = useStore((s) => s.editingId)
  const el = useStore((s) => s.doc.elements.find((e) => e.id === s.editingId)) as TextEl | undefined
  const v = useStore((s) => s.viewport)

  if (!editingId || !el) return null

  const [x, y] = toScreen(v, el.x, el.y)
  const fs = el.fontSize * v.zoom
  const m = measureText(el.text, el.fontSize)
  const width = el.text ? m.width * v.zoom + fs * 1.5 : fs * 8
  const height = Math.max(m.height, el.fontSize * LINE_HEIGHT) * v.zoom

  return (
    <textarea
      key={editingId}
      ref={registerEditor}
      className="text-editor"
      data-testid="text-editor"
      value={el.text}
      spellCheck={false}
      autoCapitalize="sentences"
      autoComplete="off"
      placeholder="Type something"
      wrap="off"
      style={{
        left: x,
        top: y,
        width,
        height,
        fontSize: fs,
        lineHeight: LINE_HEIGHT,
        fontFamily: FONT_STACK,
        color: palette[el.color],
      }}
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
