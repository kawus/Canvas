import { Eraser, Highlighter, MousePointer2, Pencil, Undo2 } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { COLOR_NAMES, type Palette } from '../constants'
import { choosePencil, INNER_R, MENU_COLORS, MENU_SIZE, MENU_TOOLS, OUTER_R, ringPos } from '../pencilMenu'
import { useStore } from '../store'

const ICONS: Record<string, ReactNode> = {
  pen: <Pencil />,
  highlighter: <Highlighter />,
  eraser: <Eraser />,
  select: <MousePointer2 />,
  undo: <Undo2 />,
}

/** The round Pencil menu, and the ring that grows while the Pencil is held still. */
export function PencilMenu({ palette }: { palette: Palette }) {
  const hold = useStore((s) => s.pencilHold)
  const menu = useStore((s) => s.pencilMenu)
  const tool = useStore((s) => s.tool)
  const style = useStore((s) => s.style)
  const setMenu = useStore((s) => s.setPencilMenu)
  const open = !!menu

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setMenu(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, setMenu])

  const highlighting = tool === 'highlighter'
  const current = highlighting ? style.highlightColor : style.color
  const colors = palette

  return (
    <>
      {hold && <div className="pencil-hold" style={{ left: hold.x, top: hold.y }} aria-hidden />}
      {menu && (
        <div
          className="pencil-backdrop"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setMenu(null)
          }}
          data-testid="pencil-menu"
        >
          <div className="pencil-menu" role="menu" aria-label="Pencil menu" style={{ left: menu.x, top: menu.y, width: MENU_SIZE, height: MENU_SIZE }}>
            {MENU_TOOLS.map((t, i) => {
              const at = ringPos(i, MENU_TOOLS.length, INNER_R)
              const on = t.key === tool
              return (
                <button
                  key={t.key}
                  type="button"
                  role="menuitem"
                  aria-label={t.label}
                  title={t.label}
                  className={`pencil-item pencil-tool ${on ? 'is-current' : ''} ${menu.active === t.key ? 'is-active' : ''}`}
                  style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
                  data-pencil-item={t.key}
                  onClick={() => choosePencil(t.key)}
                >
                  {ICONS[t.key]}
                </button>
              )
            })}
            {MENU_COLORS.map((c, i) => {
              const at = ringPos(i, MENU_COLORS.length, OUTER_R)
              const key = `c:${c}`
              return (
                <button
                  key={c}
                  type="button"
                  role="menuitem"
                  aria-label={COLOR_NAMES[c]}
                  title={COLOR_NAMES[c]}
                  className={`pencil-item pencil-color ${c === current ? 'is-current' : ''} ${menu.active === key ? 'is-active' : ''}`}
                  style={{ transform: `translate(${at.x}px, ${at.y}px)`, ['--swatch' as string]: colors[c] }}
                  data-pencil-item={key}
                  onClick={() => choosePencil(key)}
                />
              )
            })}
            <span className="pencil-center" style={{ ['--swatch' as string]: colors[current] }} aria-hidden />
          </div>
        </div>
      )}
    </>
  )
}
