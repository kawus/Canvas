import react from '@vitejs/plugin-react'
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
  ],
  // the app, and the optional front page for new visitors at /intro/
  build: {
    rollupOptions: {
      input: { index: resolve(import.meta.dirname, 'index.html'), intro: resolve(import.meta.dirname, 'intro/index.html') },
    },
  },
})
