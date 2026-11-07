import react from '@vitejs/plugin-react'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { helpPages, SITE } from './scripts/help.ts'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works from any host or sub-folder (Vercel, Netlify, GitHub Pages…)
  base: './',
  // the help centre at /help/, built from help/*.md
  plugins: [
    react(),
    helpPages(),
    // full addresses in the link-preview tags
    { name: 'site-url', transformIndexHtml: (html: string) => html.replaceAll('__SITE__', SITE) },
    // a sitemap for search engines (needs the site's address, so only on Vercel or with SITE_URL)
    {
      name: 'sitemap',
      apply: 'build',
      generateBundle() {
        if (!SITE) return
        const help = readdirSync(resolve(import.meta.dirname, 'help'))
          .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
          .map((f) => `help/${f.replace(/\.md$/, '')}/`)
        const pages = ['', 'intro/', 'templates/room-makeover-moodboard/', 'templates/client-moodboard/', 'help/', ...help]
        const urls = pages.map((p) => `  <url><loc>${SITE}/${p}</loc></url>`).join('\n')
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
        'template-room': resolve(import.meta.dirname, 'templates/room-makeover-moodboard/index.html'),
        'template-client': resolve(import.meta.dirname, 'templates/client-moodboard/index.html'),
      },
    },
  },
})
