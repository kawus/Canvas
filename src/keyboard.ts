import {
  bringToFront,
  copySelection,
  duplicateSelection,
  isEditable,
  nudge,
  pasteText,
  selectAll,
  sendToBack,
  startEditing,
} from './actions'
import { isTyping } from './controller'
import { importImages, openImagePicker } from './images'
import { useStore } from './store'
import type { Tool } from './types'

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  '1': 'select',
  h: 'hand',
  '2': 'hand',
  p: 'pen',
  d: 'pen',
  '3': 'pen',
  e: 'eraser',
  '4': 'eraser',
  r: 'rect',
  '5': 'rect',
  o: 'ellipse',
  '6': 'ellipse',
  a: 'arrow',
  '7': 'arrow',
  l: 'line',
  '8': 'line',
  t: 'text',
  '9': 'text',
  n: 'sticky',
}

export function startKeyboard() {
  const onKey = (e: KeyboardEvent) => {
    if (isTyping(e)) return
    const s = useStore.getState()
    if (s.editingId) return
    const mod = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()

    if (mod) {
      if (key === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      } else if (key === 'y') {
        e.preventDefault()
        s.redo()
      } else if (key === 'a') {
        e.preventDefault()
        selectAll()
      } else if (key === 'd') {
        e.preventDefault()
        duplicateSelection()
      } else if (key === '=' || key === '+') {
        e.preventDefault()
        s.zoomTo(s.viewport.zoom * 1.25)
      } else if (key === '-') {
        e.preventDefault()
        s.zoomTo(s.viewport.zoom / 1.25)
      } else if (key === '0') {
        e.preventDefault()
        s.zoomTo(1)
      }
      return
    }
    if (e.altKey) return

    switch (e.key) {
      case 'Backspace':
      case 'Delete':
        e.preventDefault()
        s.deleteSelected()
        return
      case 'Escape':
        if (s.selectedIds.length) s.select([])
        else if (s.tool !== 'select') s.setTool('select')
        return
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        if (!s.selectedIds.length) return
        e.preventDefault()
        const d = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0
        nudge(dx, dy)
        return
      }
      case ']':
        bringToFront()
        return
      case '[':
        sendToBack()
        return
      case '!': // shift+1
        s.zoomToFit()
        return
      case ')': // shift+0
        s.zoomTo(1)
        return
    }
    if (e.shiftKey) return
    if (key === 'i') {
      openImagePicker()
      return
    }
    if (e.key === 'Enter' && s.selectedIds.length === 1) {
      const el = s.doc.elements.find((x) => x.id === s.selectedIds[0])
      if (isEditable(el)) {
        e.preventDefault()
        startEditing(el.id)
      }
      return
    }
    const tool = TOOL_KEYS[key]
    if (tool) s.setTool(tool)
  }

  const onCopy = (e: ClipboardEvent) => {
    if (isTyping(e) || useStore.getState().editingId) return
    copySelection(e)
  }
  const onCut = (e: ClipboardEvent) => {
    if (isTyping(e) || useStore.getState().editingId) return
    if (copySelection(e)) useStore.getState().deleteSelected()
  }
  const onPaste = (e: ClipboardEvent) => {
    if (isTyping(e) || useStore.getState().editingId) return
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
    if (files.length) {
      e.preventDefault()
      void importImages(files)
      return
    }
    const text = e.clipboardData?.getData('text/plain')
    if (text) {
      e.preventDefault()
      pasteText(text)
    }
  }

  window.addEventListener('keydown', onKey)
  window.addEventListener('copy', onCopy)
  window.addEventListener('cut', onCut)
  window.addEventListener('paste', onPaste)
  return () => {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('copy', onCopy)
    window.removeEventListener('cut', onCut)
    window.removeEventListener('paste', onPaste)
  }
}
