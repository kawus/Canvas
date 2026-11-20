import { hashData, saveAsset } from './assets'
import { geometricBounds } from './geometry'
import { boxAt, freeSpot } from './placement'
import { isPhone } from './platform'
import { glideToBox, isVisible } from './slides'
import { newElementId } from './storage'
import { useStore } from './store'
import { arrange, placeBlock } from './tidy'
import type { Box, El, ImageEl, Point } from './types'

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
export async function prepareImage(file: Blob, opts: { aspect?: number; maxSide?: number } = {}) {
  const src = await decode(file)
  // optional centre crop to a width/height ratio (link card previews)
  let sx = 0
  let sy = 0
  let sw = src.width
  let sh = src.height
  if (opts.aspect) {
    if (sw / sh > opts.aspect) {
      sw = sh * opts.aspect
      sx = (src.width - sw) / 2
    } else {
      sh = sw / opts.aspect
      sy = (src.height - sh) / 2
    }
  }
  const maxSide = opts.maxSide ?? MAX_SIDE
  const k = Math.min(1, maxSide / Math.max(sw, sh), Math.sqrt(MAX_PIXELS / (sw * sh)))
  const w = Math.max(1, Math.round(sw * k))
  const h = Math.max(1, Math.round(sh * k))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h)
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
  const v = useStore.getState().viewport
  const added: ImageEl[] = []
  const taken: Box[] = []
  const many = images.length > 1
  // photos straight from a phone camera take a moment each: say so at once
  if (many) useStore.getState().showToast(`Adding ${images.length} photos…`)
  let failed = 0
  for (const [i, file] of images.entries()) {
    try {
      const { url, w, h } = await prepareImage(file)
      const hash = await hashData(url)
      await saveAsset(hash, url)
      // fit within half the screen (a quarter when adding several, a bit more on a small phone screen), never upscale
      const share = many ? (isPhone ? 0.42 : 0.28) : 0.5
      const fit = Math.min(1, (window.innerWidth * share) / v.zoom / w, (window.innerHeight * share) / v.zoom / h)
      const dw = w * fit
      const dh = h * fit
      // dropped at a point: stack there; otherwise find free space for each
      const c: Point = at ? [at[0] + i * 24, at[1] + i * 24] : freeSpot(dw, dh, taken)
      taken.push(boxAt(c, dw, dh))
      added.push({
        id: newElementId(),
        type: 'image',
        color: 'ink',
        asset: hash,
        x: c[0] - dw / 2,
        y: c[1] - dh / 2,
        w: dw,
        h: dh,
      })
    } catch (err) {
      console.error(err)
      failed++
    }
  }
  if (!added.length) {
    useStore.getState().showToast(many ? 'Couldn’t read those photos' : 'Couldn’t read that image')
    return
  }
  // several at once: they arrive neatly arranged
  let placed: El[] = added
  if (added.length > 1) {
    // shaped like the screen: two columns on a phone held upright, a landscape block on a computer
    const screenShape = window.innerWidth / Math.max(1, window.innerHeight - 220)
    const block = arrange(added, true, Math.min(1.6, Math.max(0.55, screenShape)))
    const c = at ?? freeSpot(block.w, block.h)
    placed = placeBlock(block.els, [Math.round((c[0] - block.w / 2) / 8) * 8, Math.round((c[1] - block.h / 2) / 8) * 8])
  }
  const st = useStore.getState()
  st.setTool('select')
  st.commit([...st.doc.elements, ...placed])
  st.select(placed.map((a) => a.id))
  if (many || failed) {
    const done = `${added.length} ${added.length === 1 ? 'photo' : 'photos'} added`
    st.showToast(failed ? `${done} · ${failed} couldn’t be read` : done)
  }
  // added from the picker or a paste (not dropped at a spot): make sure you see where they landed
  const b = geometricBounds(placed)
  if (!at && b && !isVisible(b)) glideToBox(b)
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
