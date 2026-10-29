import { hashData, saveAsset } from './assets'
import { toWorld } from './handles'
import { newElementId } from './storage'
import { useStore } from './store'
import type { ImageEl, Point } from './types'

const MAX_SIDE = 1600
const MAX_PIXELS = 2_600_000

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file)
    } catch {
      /* fall back to <img> */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 40_000)))
  const data = ctx.getImageData(0, 0, w, h).data
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3] < 250) return true
  }
  return false
}

/** Downscale and re-encode so boards stay light: JPEG for photos, PNG when transparent. */
async function prepare(file: Blob) {
  const src = await decode(file)
  const k = Math.min(1, MAX_SIDE / Math.max(src.width, src.height), Math.sqrt(MAX_PIXELS / (src.width * src.height)))
  const w = Math.max(1, Math.round(src.width * k))
  const h = Math.max(1, Math.round(src.height * k))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, 0, 0, w, h)
  const mayBeTransparent = /png|gif|webp|svg/.test(file.type)
  let url = mayBeTransparent && hasTransparency(ctx, w, h) ? canvas.toDataURL('image/png') : ''
  if (!url || url.length > 3_000_000) {
    // JPEG has no alpha: paint on white first
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    url = canvas.toDataURL('image/jpeg', 0.85)
  }
  return { url, w, h }
}

/** Add image files to the board, centred on `at` (world) or the middle of the screen. */
export async function importImages(files: Blob[], at?: Point) {
  const images = files.filter((f) => f.type.startsWith('image/'))
  if (!images.length) return
  const s = useStore.getState()
  const v = s.viewport
  const center = at ?? toWorld(v, window.innerWidth / 2, window.innerHeight / 2)
  const added: ImageEl[] = []
  for (const [i, file] of images.entries()) {
    try {
      const { url, w, h } = await prepare(file)
      const hash = await hashData(url)
      await saveAsset(hash, url)
      // fit within half the screen, never upscale
      const fit = Math.min(1, (window.innerWidth * 0.5) / v.zoom / w, (window.innerHeight * 0.5) / v.zoom / h)
      const dw = w * fit
      const dh = h * fit
      added.push({
        id: newElementId(),
        type: 'image',
        color: 'ink',
        asset: hash,
        x: center[0] - dw / 2 + i * 24,
        y: center[1] - dh / 2 + i * 24,
        w: dw,
        h: dh,
      })
    } catch (err) {
      console.error(err)
      useStore.getState().showToast('Couldn’t read that image')
    }
  }
  if (!added.length) return
  const st = useStore.getState()
  st.setTool('select')
  st.commit([...st.doc.elements, ...added])
  st.select(added.map((a) => a.id))
}

/** Open the system file / photo picker. Must be called from a user gesture. */
export function openImagePicker() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.style.display = 'none'
  input.onchange = () => {
    void importImages([...(input.files ?? [])])
    input.remove()
  }
  document.body.appendChild(input)
  input.click()
}
