import { inject } from '@vercel/analytics'
import { pageOnly } from '../src/analytics'
import './landing.css'

/**
 * Template pages (/templates/…/): a landing page for one kind of project,
 * with a ready-made board behind "Use the free template". Plain HTML and CSS;
 * this only counts the visit, marks the visitor as having seen an intro, and
 * fades sections in as they scroll into view.
 */

inject({ beforeSend: pageOnly })

// people who open Canvas from here have seen what it is: the app skips its splash
for (const a of document.querySelectorAll('[data-open]')) {
  a.addEventListener('click', () => {
    try {
      localStorage.setItem('canvas-intro-seen', '1')
    } catch {
      /* ignore */
    }
  })
}

const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const reveal = document.querySelectorAll('[data-reveal]')
if (still || !('IntersectionObserver' in window)) reveal.forEach((el) => el.classList.add('is-in'))
else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        e.target.classList.add('is-in')
        io.unobserve(e.target)
      }
    },
    { rootMargin: '0px 0px -10% 0px' },
  )
  reveal.forEach((el) => io.observe(el))
}
