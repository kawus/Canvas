/**
 * Font cards: a curated set of free typefaces (SIL Open Font License), kept on
 * Canvas itself in public/fonts, so showing one never contacts Google or any
 * other service. Each loads only when a board shows it.
 * `node scripts/fetch-fonts.cjs` downloads them (see public/fonts/README.md).
 */

export type FontCategory = 'Sans serif' | 'Serif' | 'Display' | 'Mono' | 'Handwriting'
export interface Font {
  id: string
  name: string
  category: FontCategory
}

export const FONTS: Font[] = [
  { id: 'inter', name: 'Inter', category: 'Sans serif' },
  { id: 'dm-sans', name: 'DM Sans', category: 'Sans serif' },
  { id: 'manrope', name: 'Manrope', category: 'Sans serif' },
  { id: 'work-sans', name: 'Work Sans', category: 'Sans serif' },
  { id: 'space-grotesk', name: 'Space Grotesk', category: 'Sans serif' },
  { id: 'outfit', name: 'Outfit', category: 'Sans serif' },
  { id: 'plus-jakarta-sans', name: 'Plus Jakarta Sans', category: 'Sans serif' },
  { id: 'karla', name: 'Karla', category: 'Sans serif' },
  { id: 'ibm-plex-sans', name: 'IBM Plex Sans', category: 'Sans serif' },
  { id: 'archivo', name: 'Archivo', category: 'Sans serif' },
  { id: 'playfair-display', name: 'Playfair Display', category: 'Serif' },
  { id: 'cormorant-garamond', name: 'Cormorant Garamond', category: 'Serif' },
  { id: 'libre-baskerville', name: 'Libre Baskerville', category: 'Serif' },
  { id: 'lora', name: 'Lora', category: 'Serif' },
  { id: 'fraunces', name: 'Fraunces', category: 'Serif' },
  { id: 'dm-serif-display', name: 'DM Serif Display', category: 'Serif' },
  { id: 'eb-garamond', name: 'EB Garamond', category: 'Serif' },
  { id: 'instrument-serif', name: 'Instrument Serif', category: 'Serif' },
  { id: 'crimson-pro', name: 'Crimson Pro', category: 'Serif' },
  { id: 'merriweather', name: 'Merriweather', category: 'Serif' },
  { id: 'bebas-neue', name: 'Bebas Neue', category: 'Display' },
  { id: 'abril-fatface', name: 'Abril Fatface', category: 'Display' },
  { id: 'syne', name: 'Syne', category: 'Display' },
  { id: 'unbounded', name: 'Unbounded', category: 'Display' },
  { id: 'righteous', name: 'Righteous', category: 'Display' },
  { id: 'jetbrains-mono', name: 'JetBrains Mono', category: 'Mono' },
  { id: 'space-mono', name: 'Space Mono', category: 'Mono' },
  { id: 'ibm-plex-mono', name: 'IBM Plex Mono', category: 'Mono' },
  { id: 'caveat', name: 'Caveat', category: 'Handwriting' },
  { id: 'dancing-script', name: 'Dancing Script', category: 'Handwriting' },
]

export const fontById = (id: string) => FONTS.find((f) => f.id === id)
/** The name a font card's text uses (prefixed, so it never clashes with fonts on the device). */
export const fontFamily = (id: string) => `CanvasFont-${id}`
export const fontFile = (id: string) => `${import.meta.env.BASE_URL}fonts/${id}.woff2`

const loading = new Map<string, Promise<void>>()
/** Load a font card's typeface (once); the board redraws with it when it arrives. */
export function loadFont(id: string) {
  if (!fontById(id) || typeof FontFace === 'undefined') return Promise.resolve()
  let p = loading.get(id)
  if (!p) {
    const face = new FontFace(fontFamily(id), `url(${fontFile(id)}) format('woff2')`)
    p = face
      .load()
      .then((f) => {
        document.fonts.add(f)
      })
      .catch(() => {})
    loading.set(id, p)
  }
  return p
}
