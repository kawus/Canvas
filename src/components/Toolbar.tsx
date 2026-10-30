import {
  Circle,
  Eraser,
  Hand,
  Highlighter,
  ImagePlus,
  Link,
  Minus,
  MousePointer2,
  MoveUpRight,
  Palette,
  Pencil,
  Plus,
  Square,
  StickyNote,
  Type,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { openImagePicker } from '../images'
import { useStore } from '../store'
import type { Tool } from '../types'
import { IconButton } from './ui'

interface ToolDef {
  tool: Tool
  label: string
  key?: string
  icon: ReactNode
}

const T: Record<string, ToolDef> = {
  select: { tool: 'select', label: 'Select', key: 'V', icon: <MousePointer2 /> },
  hand: { tool: 'hand', label: 'Hand', key: 'H', icon: <Hand /> },
  pen: { tool: 'pen', label: 'Pen', key: 'P', icon: <Pencil /> },
  highlighter: { tool: 'highlighter', label: 'Highlighter', icon: <Highlighter /> },
  eraser: { tool: 'eraser', label: 'Eraser', key: 'E', icon: <Eraser /> },
  rect: { tool: 'rect', label: 'Rectangle', key: 'R', icon: <Square /> },
  ellipse: { tool: 'ellipse', label: 'Ellipse', key: 'O', icon: <Circle /> },
  arrow: { tool: 'arrow', label: 'Arrow', key: 'A', icon: <MoveUpRight /> },
  line: { tool: 'line', label: 'Line', key: 'L', icon: <Minus style={{ transform: 'rotate(-45deg)' }} /> },
  sticky: { tool: 'sticky', label: 'Sticky note', key: 'N', icon: <StickyNote /> },
  text: { tool: 'text', label: 'Text', key: 'T', icon: <Type /> },
}

/** Related tools share one button (like FigJam); the button shows the one used last. */
const GROUPS: { id: string; label: string; tools: ToolDef[]; sepAfter?: boolean }[] = [
  { id: 'move', label: 'Move', tools: [T.select, T.hand], sepAfter: true },
  { id: 'draw', label: 'Draw', tools: [T.pen, T.highlighter, T.eraser] },
  { id: 'shapes', label: 'Shapes', tools: [T.rect, T.ellipse, T.arrow, T.line] },
  { id: 'sticky', label: 'Sticky note', tools: [T.sticky] },
  { id: 'text', label: 'Text', tools: [T.text], sepAfter: true },
]

function readLast(): Record<string, Tool> {
  try {
    return JSON.parse(localStorage.getItem('canvas-tool-groups') || '{}')
  } catch {
    return {}
  }
}

export function Toolbar() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const setInsert = useStore((s) => s.setInsert)
  const [last, setLast] = useState<Record<string, Tool>>(readLast)
  const [tray, setTray] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const press = useRef<{ timer: number; fired: boolean } | null>(null)

  // remember the tool used last in each group (also when chosen with the keyboard)
  useEffect(() => {
    const g = GROUPS.find((x) => x.tools.some((t) => t.tool === tool))
    if (!g || last[g.id] === tool) return
    const next = { ...last, [g.id]: tool }
    setLast(next)
    try {
      localStorage.setItem('canvas-tool-groups', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [tool, last])

  // close the tray on outside press / Escape
  useEffect(() => {
    if (!tray) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setTray(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTray(null)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [tray])

  const current = (g: (typeof GROUPS)[number]) =>
    g.tools.find((t) => t.tool === tool) ?? g.tools.find((t) => t.tool === last[g.id]) ?? g.tools[0]

  // press and hold opens a group's tray (handy on touch)
  const holdHandlers = (id: string) => ({
    onPointerDown: () => {
      const p = { fired: false, timer: 0 }
      p.timer = window.setTimeout(() => {
        p.fired = true
        setTray(id)
      }, 420)
      press.current = p
    },
    onPointerUp: () => press.current && clearTimeout(press.current.timer),
    onPointerLeave: () => press.current && clearTimeout(press.current.timer),
  })

  const groupClick = (g: (typeof GROUPS)[number]) => {
    if (press.current?.fired) {
      press.current = null
      return
    }
    const active = g.tools.some((t) => t.tool === tool)
    // tapping the active group again shows its other tools
    if (active && g.tools.length > 1) setTray(tray === g.id ? null : g.id)
    else {
      setTool(current(g).tool)
      setTray(null)
    }
  }

  const trayGroup = GROUPS.find((g) => g.id === tray)
  const insertItems = [
    { id: 'image', label: 'Image', icon: <ImagePlus />, run: () => openImagePicker() },
    { id: 'link', label: 'Link', icon: <Link />, run: () => setInsert('link') },
    { id: 'color', label: 'Colour', icon: <Palette />, run: () => setInsert('color') },
  ]

  return (
    <div className="toolbar-wrap" ref={ref}>
      {(trayGroup || tray === 'insert') && (
        <div className="tool-tray panel" role="menu" data-testid={`tray-${tray}`}>
          {trayGroup
            ? trayGroup.tools.map((t) => (
                <button
                  key={t.tool}
                  type="button"
                  role="menuitemradio"
                  aria-checked={tool === t.tool}
                  className={`tray-item ${tool === t.tool ? 'is-active' : ''}`}
                  onClick={() => {
                    setTool(t.tool)
                    setTray(null)
                  }}
                  data-testid={`tool-${t.tool}`}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))
            : insertItems.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  role="menuitem"
                  className="tray-item"
                  onClick={() => {
                    setTray(null)
                    it.run()
                  }}
                  data-testid={`insert-${it.id}`}
                >
                  {it.icon}
                  <span>{it.label}</span>
                </button>
              ))}
        </div>
      )}
      <div className="toolbar panel" role="toolbar" aria-label="Tools">
        {GROUPS.map((g) => {
          const def = current(g)
          const active = g.tools.some((t) => t.tool === tool)
          return (
            <div key={g.id} className={`toolbar-slot ${g.sepAfter ? 'sep-after' : ''}`} {...holdHandlers(g.id)}>
              <IconButton
                label={def.label}
                kbd={def.key}
                active={active}
                onClick={() => groupClick(g)}
                testId={`group-${g.id}`}
                className={`tool-btn ${g.tools.length > 1 ? 'has-more' : ''}`}
              >
                {def.icon}
              </IconButton>
            </div>
          )
        })}
        <IconButton
          label="Insert image, link or colour"
          kbd="I"
          active={tray === 'insert'}
          onClick={() => setTray(tray === 'insert' ? null : 'insert')}
          testId="group-insert"
          className="tool-btn"
        >
          <Plus />
        </IconButton>
      </div>
    </div>
  )
}
