// @ts-nocheck: a local tool that uses the preinstalled Playwright, not a project dependency
/**
 * Pictures of each template board, exactly as it opens in Canvas, for the
 * template pages and link previews (public/media/templates/<name>-light.jpg
 * and -dark.jpg). Run again whenever a template changes:
 *
 *   npm run build && npx vite preview --port 4174   (in one terminal)
 *   node scripts/template-previews.cjs http://localhost:4174
 *
 * Needs Playwright (preinstalled in the cloud sessions).
 */
const { chromium } = require('playwright')
const { resolve } = require('node:path')

const BASE = (process.argv[2] || 'http://localhost:4174').replace(/\/$/, '')
const OUT = resolve(__dirname, '../public/media/templates')
const TEMPLATES = ['room-makeover', 'client-moodboard', 'brand-identity']

;(async () => {
  const browser = await chromium.launch()
  for (const name of TEMPLATES) {
    for (const theme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5, colorScheme: theme })
      await ctx.addInitScript((/** @type {string} */ t) => {
        localStorage.setItem('canvas-welcomed', '1')
        localStorage.setItem('canvas-connect-later', '1')
        localStorage.setItem('canvas-theme', t)
      }, theme)
      const page = await ctx.newPage()
      await page.goto(`${BASE}/?from=intro#template=${name}`)
      await page.waitForTimeout(2500)
      // focus mode hides every button; then fit the whole board
      await page.keyboard.press('f')
      await page.keyboard.press('Shift+Digit1')
      await page.addStyleTag({ content: '.focus-exit { display: none !important; }' })
      await page.waitForTimeout(1500)
      await page.screenshot({ path: `${OUT}/${name}-${theme}.jpg`, type: 'jpeg', quality: 80 })
      console.log(`${name}-${theme}.jpg`)
      await ctx.close()
    }
  }
  await browser.close()
})()
