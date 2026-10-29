import { Circle, Eraser, Hand, ImagePlus, Minus, MousePointer2, MoveUpRight, Pencil, Square, StickyNote, Type } from 'lucide-react'
import { openImagePicker } from '../images'
import type { ReactNode } from 'react'
import { useStore } from '../store'
import type { Tool } from '../types'
import { IconButton } from './ui'

export const TOOLS: { tool: Tool; label: string; key: string; icon: ReactNode }[] = [
  { tool: 'select', label: 'Select', key: 'V', icon: <MousePointer2 /> },
  { tool: 'hand', label: 'Hand', key: 'H', icon: <Hand /> },
  { tool: 'pen', label: 'Pen', key: 'P', icon: <Pencil /> },
  { tool: 'eraser', label: 'Eraser', key: 'E', icon: <Eraser /> },
  { tool: 'sticky', label: 'Sticky note', key: 'N', icon: <StickyNote /> },
  { tool: 'rect', label: 'Rectangle', key: 'R', icon: <Square /> },
  { tool: 'ellipse', label: 'Ellipse', key: 'O', icon: <Circle /> },
  { tool: 'arrow', label: 'Arrow', key: 'A', icon: <MoveUpRight /> },
  { tool: 'line', label: 'Line', key: 'L', icon: <Minus style={{ transform: 'rotate(-45deg)' }} /> },
  { tool: 'text', label: 'Text', key: 'T', icon: <Type /> },
]

const GROUPS: Tool[][] = [['select', 'hand'], ['pen', 'eraser'], ['sticky', 'rect', 'ellipse', 'arrow', 'line'], ['text']]

export function Toolbar() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  return (
    <div className="toolbar panel" role="toolbar" aria-label="Tools">
      {GROUPS.map((group, gi) => (
        <div className="toolbar-group" key={gi}>
          {group.map((t) => {
            const def = TOOLS.find((d) => d.tool === t)!
            return (
              <IconButton
                key={t}
                label={def.label}
                kbd={def.key}
                active={tool === t}
                onClick={() => setTool(t)}
                testId={`tool-${t}`}
                className="tool-btn"
              >
                {def.icon}
              </IconButton>
            )
          })}
          {gi === GROUPS.length - 1 && (
            // not a mode: opens the photo / file picker right away
            <IconButton label="Image" kbd="I" onClick={openImagePicker} testId="tool-image" className="tool-btn">
              <ImagePlus />
            </IconButton>
          )}
        </div>
      ))}
    </div>
  )
}
