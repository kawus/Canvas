# Canvas

A calm, minimal whiteboard for sketching, writing and simple shapes. It works with a mouse, a trackpad, touch, and Apple Pencil. You don't need an account.

## What it does

- **Tools:** Select, Hand, Pen (pressure-sensitive), Eraser, Rectangle, Ellipse, Arrow, Line and Text.
- **Style:** 8 colors (Apple system palette), 3 stroke weights, outline/tint/solid fill and 4 text sizes. When something is selected, a style bar appears above the toolbar.
- **Editing:** move, resize (Shift keeps proportions), duplicate (⌘D or Alt-drag), copy/paste, layer order, undo/redo and arrow-key nudging.
- **iPad + Apple Pencil:** pressure-sensitive ink. Once the Pencil is detected, your finger pans the board and a resting palm is ignored. Pinch with two fingers to zoom. Tapping with the Text tool opens the keyboard (Scribble works too).
- **Export:** PDF (vector, with Geist embedded), PNG and SVG. You can export the whole board or only the selection.
- **Boards & links:** every board gets its own short link (`/#k3v9x2pq7d4m`) and saves automatically. With cloud saving turned on (see below), that link opens the live board on any device. Recent boards are in the top-left menu.
- **Share:** "Live board" sends the board itself (anyone with the link can open and edit it). "A copy" sends a snapshot that becomes the recipient's own board. No sign-in either way.
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

## Deploy to Vercel

**1. Put the app online (about 2 minutes)**

1. Go to [vercel.com/new](https://vercel.com/new) and sign in with GitHub.
2. Pick the `kawus/Canvas` repository and click **Import**. If it isn't listed, choose **Adjust GitHub App Permissions** and give Vercel access to it.
3. Leave the settings as they are (`vercel.json` already sets them) and click **Deploy**.

You get a public address like `canvas-xyz.vercel.app`. From then on, every push to the production branch redeploys automatically, and other branches get preview links.

> Vercel deploys the repository's default branch to production (currently `claude/minimal-whiteboard-app-mcpcrw`). If you later rename it to `main`, update **Settings → Git → Production Branch** in Vercel.

At this stage everything works, but boards are saved only in the browser that made them. The Share button gives a link that contains *a copy* of the board.

**2. Turn on cloud links (about 2 minutes, free tier)**

So that a board's own link opens the live board on any device:

1. In your Vercel project, open the **Storage** tab, or go to the [Upstash for Redis](https://vercel.com/marketplace/upstash) integration in the Marketplace.
2. Create a free Redis database and connect it to this project. Vercel adds the connection settings (environment variables) for you.
3. Redeploy: **Deployments → ⋯ → Redeploy**.

Check it worked: open the app, draw something, and a small cloud icon appears next to the board name. Share now offers **Live board** (anyone with the link can open and edit it) or **A copy** (the snapshot link, as before).

The function accepts either `KV_REST_API_URL` + `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, so it works whichever names the integration uses. If the cloud icon doesn't appear, check **Settings → Environment Variables** for one of these pairs.

**Other static hosts** (Netlify, GitHub Pages, …): upload `dist/` after `npm run build`. Everything works except cloud links, which need the `api/` function.

## How saving works

- **On the device, always.** Every change is saved in the browser (IndexedDB) right away, so the app works offline and opens instantly.
- **In the cloud, when it's turned on.** Shortly after you stop drawing, the board is uploaded (`api/board.js` → Redis), keyed by the random id in its link. Opening the link on another device downloads it. When you return to a tab, it picks up edits made elsewhere. The cloud icon next to the title shows the state: saving, saved, or offline (offline changes upload when you're back online).
- **No accounts.** The 12-character link is the key: anyone with it can open and edit that board. Boards with no edits for a year expire from the cloud.
- **Not real-time collaboration yet.** If two people edit the same board at the same moment, the last save wins. Live multiplayer editing is a possible next step.

## Project layout

```
src/
  controller.ts   pointer/pen/touch/wheel handling (all canvas gestures)
  geometry.ts     bounds, hit-testing, move/resize math
  render.ts       element → SVG primitives (shared by canvas and exports)
  export.ts       PDF / PNG / SVG export
  storage.ts      IndexedDB boards + share-link encoding
  cloud.ts        client for the cloud save endpoint
  boards.ts       routing by URL, autosave, cloud sync, new/duplicate/delete
  store.ts        app state (zustand) with undo/redo
  components/     toolbar, style bar, menus, overlays
api/
  board.js        Vercel Function: GET / PUT / DELETE a board in Redis
```

Built with Vite, React, TypeScript, [perfect-freehand](https://github.com/steveruizok/perfect-freehand), [Lucide](https://lucide.dev) icons, [Geist](https://vercel.com/font) (SIL OFL), jsPDF + svg2pdf.js.
