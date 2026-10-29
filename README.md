# Canvas

A calm, minimal whiteboard for sketching, writing and simple shapes. It works with a mouse, a trackpad, touch, and Apple Pencil. You don't need an account.

## What it does

- **Tools:** Select, Hand, Pen (pressure-sensitive), Eraser, Rectangle, Ellipse, Arrow, Line and Text.
- **Style:** 8 colors (Apple system palette), 3 stroke weights, outline/tint/solid fill and 4 text sizes. When something is selected, a style bar appears above the toolbar.
- **Editing:** move, resize (Shift keeps proportions), duplicate (⌘D or Alt-drag), copy/paste, layer order, undo/redo and arrow-key nudging.
- **iPad + Apple Pencil:** pressure-sensitive ink. Once the Pencil is detected, your finger pans the board and a resting palm is ignored. Pinch with two fingers to zoom. Tapping with the Text tool opens the keyboard (Scribble works too).
- **Export:** PDF (vector, with Geist embedded), PNG and SVG. You can export the whole board or only the selection.
- **Boards & links:** every board gets its own short link (`/#k3v9x2pq7d`) and saves automatically in the browser. Recent boards are in the top-left menu.
- **Share:** creates a link that contains the board, so it opens on any device without sign-in. Each recipient gets their own copy.
- **Light and dark mode** (follows the system by default). On iPad you can "Add to Home Screen" to use it full-screen like an app.

## Keyboard shortcuts

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| V | Select | ⌘Z / ⇧⌘Z | Undo / Redo |
| H or Space | Pan | ⌘D | Duplicate |
| P | Pen | ⌘C / ⌘V | Copy / Paste |
| E | Eraser | ⌫ | Delete |
| R / O | Rectangle / Ellipse | [ / ] | Send back / Bring front |
| A / L | Arrow / Line | ⇧1 / ⇧0 | Zoom to fit / 100% |
| T | Text (or double-click canvas) | ⌘ + scroll / pinch | Zoom |

## Run it locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Deploy

This is a static site with no server. To deploy it:

- **Vercel / Netlify:** import the GitHub repo. They detect Vite automatically (build: `npm run build`, output: `dist`).
- **GitHub Pages / any static host:** upload the contents of `dist/`. Asset paths are relative, so it also works in a sub-folder.

## How saving works (and what's next)

Boards are stored in the browser's IndexedDB, keyed by the id in the URL:

- The same link reopens the board **in the same browser**.
- A **Share** link carries a compressed copy of the board in the URL, so it opens anywhere. Very large boards produce long links; PDF export is the fallback for those.

The next step is **cloud links**, so a board's own link opens the live board on any device, still without sign-in. That needs a small key-value backend (for example Vercel KV, Cloudflare KV or Supabase). Saving is isolated in `src/storage.ts`, so that change touches only one file.

## Project layout

```
src/
  controller.ts   pointer/pen/touch/wheel handling (all canvas gestures)
  geometry.ts     bounds, hit-testing, move/resize math
  render.ts       element → SVG primitives (shared by canvas and exports)
  export.ts       PDF / PNG / SVG export
  storage.ts      IndexedDB boards + share-link encoding
  boards.ts       routing by URL, autosave, new/duplicate/delete
  store.ts        app state (zustand) with undo/redo
  components/     toolbar, style bar, menus, overlays
```

Built with Vite, React, TypeScript, [perfect-freehand](https://github.com/steveruizok/perfect-freehand), [Lucide](https://lucide.dev) icons, [Geist](https://vercel.com/font) (SIL OFL), jsPDF + svg2pdf.js.
