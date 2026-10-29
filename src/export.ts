import { loadAsset } from './assets'
import fontWoff2Url from './assets/fonts/Geist-Variable.woff2?url'
import fontTtfUrl from './assets/fonts/Geist-Regular.ttf?url'
import { FONT_FAMILY, PALETTE_LIGHT } from './constants'
import { unionBounds } from './geometry'
import { elementPrims, primToMarkup } from './render'
import type { El } from './types'

const PAD = 32

/** Free text, sticky notes and shape labels all need the font embedded. */
const hasText = (els: El[]) => els.some((e) => 'text' in e && !!e.text)

async function fetchBase64(url: string) {
  const buf = await (await fetch(url)).arrayBuffer()
  let bin = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

/** Build a standalone SVG of the given elements (always in the light palette). */
export async function buildSvg(elements: El[], opts: { embedFont: boolean; background: boolean }) {
  const b = unionBounds(elements)!
  const x = b.minX - PAD
  const y = b.minY - PAD
  const width = Math.ceil(b.maxX - b.minX + PAD * 2)
  const height = Math.ceil(b.maxY - b.minY + PAD * 2)
  let defs = ''
  if (opts.embedFont && hasText(elements)) {
    const data = await fetchBase64(fontWoff2Url)
    defs = `<defs><style>@font-face{font-family:'${FONT_FAMILY}';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:100 900;}</style></defs>`
  }
  const assets = new Map<string, string>()
  for (const el of elements) {
    if (el.type === 'image' && !assets.has(el.asset)) {
      const url = await loadAsset(el.asset)
      if (url) assets.set(el.asset, url)
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">${defs}${bg}${body}</svg>`
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
  const { svg } = await buildSvg(elements, { embedFont: true, background: true })
  download(new Blob([svg], { type: 'image/svg+xml' }), fileName(title, 'svg'))
}

export async function exportPng(elements: El[], title: string) {
  const { svg, width, height } = await buildSvg(elements, { embedFont: true, background: true })
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
  const { svg, width, height } = await buildSvg(elements, { embedFont: false, background: true })
  // PDF pages are limited to 14400pt; scale very large boards down to fit.
  const k = Math.min(1, 14400 / Math.max(width, height))
  const pw = width * k
  const ph = height * k
  const pdf = new jsPDF({ unit: 'pt', format: [pw, ph], orientation: pw >= ph ? 'landscape' : 'portrait', compress: true })
  pdf.setProperties({ title, creator: 'Canvas' })
  if (hasText(elements)) {
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
