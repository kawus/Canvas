import { loadAsset } from './assets'
import fontWoff2Url from './assets/fonts/Geist-Variable.woff2?url'
import fontTtfUrl from './assets/fonts/Geist-Regular.ttf?url'
import { FONT_FAMILY, PALETTE_LIGHT } from './constants'
import { contentOf, unionBounds } from './geometry'
import { elementPrims, primToMarkup } from './render'
import { textWidth } from './textMetrics'
import type { El } from './types'

const PAD = 32

/** Free text, sticky notes and shape labels all need the font embedded. */
const hasText = (els: El[]) => els.some((e) => ('text' in e && !!e.text) || e.type === 'link' || e.type === 'swatch')

async function fetchBase64(url: string) {
  const buf = await (await fetch(url)).arrayBuffer()
  let bin = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * "Made with Canvas · canvas.kawus.com", small and grey under the bottom-right
 * corner of an export, so a shared picture or PDF leads people back here.
 * Sized to the export, so it reads the same on a small sketch and a huge board.
 */
function madeWithMark(right: number, top: number, width: number) {
  const size = Math.round(Math.min(40, Math.max(11, width * 0.011)))
  const text = `Made with Canvas · ${location.host || 'Canvas'}`
  const baseline = top + size * 0.9
  const tw = textWidth(text, size)
  const logo = size * 1.25
  const lx = right - tw - size * 0.5 - logo
  const ly = baseline - size * 0.35 - logo / 2
  const k = logo / 24
  return {
    rowHeight: Math.round(size * 2),
    markup:
      `<g transform="translate(${lx} ${ly}) scale(${k})"><rect x="1" y="1" width="22" height="22" rx="6.5" fill="#1d1d1f"/>` +
      `<path d="M7 15.5c2.2-4.6 4.2-7 6-7 2.4 0-1.6 7 1.2 7 1.1 0 2-1 2.8-2.4" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>` +
      `<text x="${right}" y="${baseline}" text-anchor="end" font-family="${FONT_FAMILY}" font-size="${size}" fill="#8e8e93">${esc(text)}</text>`,
  }
}

/** Build a standalone SVG of the given elements (always in the light palette). */
export async function buildSvg(all: El[], opts: { embedFont: boolean; background: boolean; mark?: boolean }) {
  // slide frames are for presenting only
  const elements = contentOf(all)
  const b = unionBounds(elements) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  const x = b.minX - PAD
  const y = b.minY - PAD
  const width = Math.ceil(b.maxX - b.minX + PAD * 2)
  // the mark gets a slim row of its own under the board, so it never covers anything
  const mark = opts.mark ? madeWithMark(x + width - PAD, y + Math.ceil(b.maxY - b.minY + PAD * 2) - PAD / 2, width) : null
  const height = Math.ceil(b.maxY - b.minY + PAD * 2) + (mark?.rowHeight ?? 0)
  let defs = ''
  if (opts.embedFont && (hasText(elements) || mark)) {
    const data = await fetchBase64(fontWoff2Url)
    defs = `<defs><style>@font-face{font-family:'${FONT_FAMILY}';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:100 900;}</style></defs>`
  }
  const assets = new Map<string, string>()
  for (const el of elements) {
    const hash = el.type === 'image' ? el.asset : el.type === 'link' ? el.image : undefined
    if (hash && !assets.has(hash)) {
      const url = await loadAsset(hash)
      if (url) assets.set(hash, url)
    }
  }
  const body = elements
    .flatMap((el) => elementPrims(el, PALETTE_LIGHT, (h) => assets.get(h)))
    .map((p) => {
      if (p.tag === 'text') p.attrs.fontFamily = FONT_FAMILY
      return primToMarkup(p)
    })
    .join('')
  const bg = opts.background ? `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff"/>` : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">${defs}${bg}${body}${mark?.markup ?? ''}</svg>`
  return { svg, width, height }
}

function fileName(title: string, ext: string) {
  const base = title.trim().replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) || 'Untitled'
  return `${base}.${ext}`
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function exportSvg(elements: El[], title: string) {
  const { svg } = await buildSvg(elements, { embedFont: true, background: true, mark: true })
  download(new Blob([svg], { type: 'image/svg+xml' }), fileName(title, 'svg'))
}

/**
 * A 1200×630 picture of the board for link previews in messaging apps: the
 * board on Canvas's dotted paper with a small Canvas badge. JPEG data URL.
 */
export async function boardSnapshot(elements: El[]): Promise<string | null> {
  if (!contentOf(elements).length) return null
  const { svg, width, height } = await buildSvg(elements, { embedFont: true, background: false })
  const img = new Image()
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Could not render image'))
      img.src = url
    })
    const W = 1200
    const H = 630
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fbfbfb'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#d9d9de'
    for (let x = 12; x < W; x += 24) for (let y = 12; y < H; y += 24) ctx.fillRect(x - 1, y - 1, 2, 2)
    // the board, as large as fits above the badge (small boards aren't blown up too far)
    const box = { x: 48, y: 36, w: W - 96, h: H - 36 - 84 }
    const k = Math.min(box.w / width, box.h / height, 2.5)
    const dw = width * k
    const dh = height * k
    ctx.drawImage(img, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh)
    // the Canvas badge
    ctx.save()
    ctx.translate(48, H - 66)
    ctx.scale(30 / 24, 30 / 24)
    ctx.fillStyle = '#1d1d1f'
    ctx.beginPath()
    ctx.roundRect(1, 1, 22, 22, 6.5)
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke(new Path2D('M7 15.5c2.2-4.6 4.2-7 6-7 2.4 0-1.6 7 1.2 7 1.1 0 2-1 2.8-2.4'))
    ctx.restore()
    ctx.fillStyle = '#1d1d1f'
    ctx.font = `600 26px ${FONT_FAMILY}, system-ui, sans-serif`
    ctx.textBaseline = 'middle'
    ctx.fillText('Canvas', 90, H - 49)
    return canvas.toDataURL('image/jpeg', 0.86)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function exportPng(elements: El[], title: string) {
  const { svg, width, height } = await buildSvg(elements, { embedFont: true, background: true, mark: true })
  // iPad Safari caps canvases at ~16.7M pixels
  const scale = Math.min(3, Math.sqrt(16_000_000 / (width * height)), 8192 / Math.max(width, height))
  const img = new Image()
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Could not render image'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    if (!blob) throw new Error('Could not create PNG')
    download(blob, fileName(title, 'png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function exportPdf(elements: El[], title: string) {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')])
  const { svg, width, height } = await buildSvg(elements, { embedFont: false, background: true, mark: true })
  // PDF pages are limited to 14400pt; scale very large boards down to fit.
  const k = Math.min(1, 14400 / Math.max(width, height))
  const pw = width * k
  const ph = height * k
  const pdf = new jsPDF({ unit: 'pt', format: [pw, ph], orientation: pw >= ph ? 'landscape' : 'portrait', compress: true })
  pdf.setProperties({ title, creator: 'Canvas' })
  // the Canvas mark is text too, so the font always goes in
  {
    const ttf = await fetchBase64(fontTtfUrl)
    pdf.addFileToVFS('Geist-Regular.ttf', ttf)
    pdf.addFont('Geist-Regular.ttf', FONT_FAMILY, 'normal')
    pdf.setFont(FONT_FAMILY, 'normal')
  }
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden'
  host.innerHTML = svg
  document.body.appendChild(host)
  try {
    await svg2pdf(host.firstElementChild as SVGSVGElement, pdf, { x: 0, y: 0, width: pw, height: ph })
  } finally {
    host.remove()
  }
  download(pdf.output('blob'), fileName(title, 'pdf'))
}
