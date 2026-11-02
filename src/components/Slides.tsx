import { GripVertical, Play, Plus, Presentation } from 'lucide-react'
import { useRef, useState } from 'react'
import { PALETTE_DARK, PALETTE_LIGHT } from '../constants'
import { boxIntersects, contentOf, getBounds } from '../geometry'
import { addSlide, reorderSlides, showSlide, slideBox, slidesOf, startPresenting } from '../slides'
import { useStore } from '../store'
import type { SlideEl } from '../types'
import { ElementView } from './Canvas'
import { usePopover } from './ui'

const ROW = 72

/** A small picture of what's on a slide. */
function SlideThumb({ slide }: { slide: SlideEl }) {
  const elements = useStore((s) => s.doc.elements)
  const dark = document.documentElement.dataset.theme === 'dark'
  const box = slideBox(slide)
  const inside = contentOf(elements).filter((e) => boxIntersects(getBounds(e), box))
  return (
    <span className="slide-thumb" aria-hidden>
      <svg viewBox={`${slide.x} ${slide.y} ${slide.w} ${slide.h}`} preserveAspectRatio="xMidYMid slice">
        {inside.map((el) => (
          <ElementView key={el.id} el={el} palette={dark ? PALETTE_DARK : PALETTE_LIGHT} faded={false} editing={false} />
        ))}
      </svg>
    </span>
  )
}

/** The Present button: your slides, adding one, and playing the show. */
export function PresentButton() {
  const { open, setOpen, ref } = usePopover()
  const elements = useStore((s) => s.doc.elements)
  const canEdit = useStore((s) => !!s.doc.key)
  const selectedIds = useStore((s) => s.selectedIds)
  const slides = slidesOf(elements)
  const [drag, setDrag] = useState<{ id: string; from: number; startY: number; dy: number } | null>(null)
  const list = useRef<HTMLDivElement>(null)

  const chosen = selectedIds.length === 1 ? slides.findIndex((s) => s.id === selectedIds[0]) : -1
  const from = Math.max(chosen, 0)

  // a view-only board without slides has nothing to present
  if (!canEdit && !slides.length) return null

  // while dragging, show the slides in their new order
  let order = slides
  let to = -1
  if (drag) {
    to = Math.max(0, Math.min(slides.length - 1, drag.from + Math.round(drag.dy / ROW)))
    order = slides.filter((s) => s.id !== drag.id)
    order.splice(to, 0, slides[drag.from])
  }

  const add = () => {
    addSlide()
    requestAnimationFrame(() => list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }))
  }

  return (
    <div className="share-wrap" ref={ref}>
      <button
        type="button"
        className={`panel-btn present-btn ${open ? 'is-open' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        data-testid="present"
      >
        <Presentation />
        <span>Present</span>
      </button>
      {open && (
        <div className="popover popover-right slides-pop" data-testid="slides-pop">
          <div className="menu-heading">Slides</div>
          {!slides.length && (
            <p className="slides-empty">Turn parts of your board into slides, then play them as a show that glides across the board.</p>
          )}
          {slides.length > 0 && (
            <div className="slides-list" ref={list} style={{ maxHeight: ROW * 4.5 }}>
              {order.map((slide) => {
                const i = slides.indexOf(slide)
                const dragging = drag?.id === slide.id
                const shownAt = order.indexOf(slide)
                return (
                  <div
                    key={slide.id}
                    className={`slide-row ${chosen === i ? 'is-active' : ''} ${dragging ? 'is-dragging' : ''}`}
                    style={dragging ? { transform: `translateY(${drag.dy - (to - drag.from) * ROW}px)` } : undefined}
                    onClick={() => showSlide(slide)}
                    aria-label={`Slide ${dragging ? to + 1 : shownAt + 1}`}
                    data-testid="slide-row"
                  >
                    <span className="slide-num">{dragging ? to + 1 : shownAt + 1}</span>
                    <SlideThumb slide={slide} />
                    <span className="slide-spacer" />
                    {canEdit && slides.length > 1 && (
                      <span
                        className="slide-grip"
                        aria-label="Drag to reorder"
                        title="Drag to reorder"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          e.currentTarget.setPointerCapture(e.pointerId)
                          setDrag({ id: slide.id, from: i, startY: e.clientY, dy: 0 })
                        }}
                        onPointerMove={(e) => drag?.id === slide.id && setDrag({ ...drag, dy: e.clientY - drag.startY })}
                        onPointerUp={() => {
                          if (drag && to !== drag.from) reorderSlides(order.map((s) => s.id))
                          setDrag(null)
                        }}
                        onPointerCancel={() => setDrag(null)}
                        data-testid="slide-grip"
                      >
                        <GripVertical />
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {canEdit && (
            <button type="button" className="slides-add" onClick={add} data-testid="slide-add">
              <Plus />
              <span>
                Add slide
                <small>Frames what’s on your screen now</small>
              </span>
            </button>
          )}
          {slides.length > 0 && (
            <button
              type="button"
              className="primary-btn slides-play"
              onClick={() => {
                setOpen(false)
                startPresenting(from)
              }}
              data-testid="slides-play"
            >
              <Play />
              <span>Play from slide {from + 1}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
