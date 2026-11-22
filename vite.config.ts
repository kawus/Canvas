import react from '@vitejs/plugin-react'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { helpPages, SITE } from './scripts/help.ts'
import { changelogPage, latestChange } from './scripts/changelog.ts'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works from any host or sub-folder (Vercel, Netlify, GitHub Pages…)
  base: './',
  // the newest changelog date, for the app's quiet "what's new" dot
  define: { __LATEST_CHANGE__: JSON.stringify(latestChange()) },
  // the help centre at /help/, built from help/*.md
  plugins: [
    react(),
    helpPages(),
    changelogPage(),
    // full addresses in the link-preview tags
    { name: 'site-url', transformIndexHtml: (html: string) => html.replaceAll('__SITE__', SITE) },
    // every player and map service (media.ts) must be allowed as a frame by the security policy (vercel.json)
    {
      name: 'player-hosts-in-policy',
      buildStart() {
        const media = readFileSync(resolve(import.meta.dirname, 'src/media.ts'), 'utf8')
        const list = /PLAYER_HOSTS = \[([^\]]*)\]/.exec(media)?.[1] ?? ''
        const hosts = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1])
        const policy = readFileSync(resolve(import.meta.dirname, 'vercel.json'), 'utf8')
        const frames = /frame-src ([^;"]*)/.exec(policy)?.[1].split(' ') ?? []
        const missing = hosts.filter((h) => !frames.includes(`https://${h}`))
        if (!hosts.length || missing.length) this.error(`Add these player hosts to frame-src in vercel.json: ${missing.join(', ') || '(none found)'}`)
      },
    },
    // a sitemap for search engines (needs the site's address, so only on Vercel or with SITE_URL)
    {
      name: 'sitemap',
      apply: 'build',
      generateBundle() {
        if (!SITE) return
        const help = readdirSync(resolve(import.meta.dirname, 'help'))
          .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
          .map((f) => `help/${f.replace(/\.md$/, '')}/`)
        const pages = ['', 'intro/', 'templates/', 'templates/room-makeover-moodboard/', 'templates/client-moodboard/', 'templates/brand-identity-moodboard/', 'changelog/', 'help/', ...help]
        const day = new Date().toISOString().slice(0, 10)
        const urls = pages.map((p) => `  <url><loc>${SITE}/${p}</loc><lastmod>${day}</lastmod></url>`).join('\n')
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n` })
        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE}/sitemap.xml\n` })
      },
    },
  ],
  // the app, the optional front page for new visitors at /intro/, and the template pages
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        intro: resolve(import.meta.dirname, 'intro/index.html'),
        // template pages: a landing page per kind of project, each with a ready-made board
        templates: resolve(import.meta.dirname, 'templates/index.html'),
        changelog: resolve(import.meta.dirname, 'changelog/index.html'),
        // take an email off the updates list and the Ideas board (not in the sitemap)
        unsubscribe: resolve(import.meta.dirname, 'unsubscribe/index.html'),
        'template-room': resolve(import.meta.dirname, 'templates/room-makeover-moodboard/index.html'),
        'template-client': resolve(import.meta.dirname, 'templates/client-moodboard/index.html'),
        'template-brand': resolve(import.meta.dirname, 'templates/brand-identity-moodboard/index.html'),
      },
    },
  },
})
