// @ts-nocheck: a one-off download tool
/**
 * Downloads the font cards' typefaces (Latin, regular weight) into public/fonts.
 * They're free fonts under the SIL Open Font License; run again after changing
 * the list in src/fonts.ts:  node scripts/fetch-fonts.cjs
 */
const fs = require('node:fs')
const path = require('node:path')

const src = fs.readFileSync(path.join(__dirname, '../src/fonts.ts'), 'utf8')
const ids = [...src.matchAll(/\{ id: '([a-z0-9-]+)'/g)].map((m) => m[1])
const out = path.join(__dirname, '../public/fonts')
fs.mkdirSync(out, { recursive: true })

;(async () => {
  for (const id of ids) {
    const res = await fetch(`https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/latin-400-normal.woff2`)
    if (!res.ok) {
      console.log('missing', id, res.status)
      continue
    }
    fs.writeFileSync(path.join(out, `${id}.woff2`), Buffer.from(await res.arrayBuffer()))
    console.log('ok', id)
  }
})()
