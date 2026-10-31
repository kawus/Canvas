import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FONT_FAMILY } from './constants'
import { calibrateFont } from './textMetrics'
import './index.css'

// iPadOS: stop pinch-zooming the page itself; the canvas handles its own zoom.
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false })

async function boot() {
  // Text is measured with canvas, so wait for Geist before the first render.
  try {
    await Promise.race([document.fonts.load(`16px ${FONT_FAMILY}`), new Promise((r) => setTimeout(r, 2500))])
  } catch {
    /* fall back to whatever is available */
  }
  calibrateFont()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

/** Nobody has used Canvas in this browser yet, and they didn't open a link to a board. */
function brandNew() {
  if (location.hash || location.search) return false
  try {
    return !['canvas-keys-v1', 'canvas-welcomed', 'canvas-intro-seen'].some((k) => localStorage.getItem(k))
  } catch {
    return false
  }
}

// The optional front page: with VITE_FRONT_PAGE=on, brand-new visitors see /intro/ first
if (import.meta.env.VITE_FRONT_PAGE === 'on' && brandNew()) location.replace('intro/')
else void boot()
