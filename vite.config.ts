import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { helpPages } from './scripts/help.ts'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works from any host or sub-folder (Vercel, Netlify, GitHub Pages…)
  base: './',
  // the help centre at /help/, built from help/*.md
  plugins: [react(), helpPages()],
})
