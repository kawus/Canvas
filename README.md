# Canvas

A calm, minimal whiteboard for sketching, writing and simple shapes. It works with a mouse, a trackpad, touch, and Apple Pencil. You don't need an account.

## What it does

- **Toolbar (FigJam-style groups):** Move (Select / Hand), Draw (Pen / Highlighter / Eraser), Shapes (Rectangle / Ellipse / Arrow / Line), Sticky note, Text, and **+** (Image / Link / Colour). A group shows the tool used last; tap it again, or press and hold, to pick another. The style bar is compact too: colour, stroke, fill and text size each open a small menu, and **⋯** holds duplicate and layer order — everything fits on an iPhone.
- **Pen** is pressure-sensitive and smoothed even for fast strokes; the **Highlighter** draws wide, translucent ink.
- **Sticky notes:** tap to place and start typing. Text wraps and shrinks to fit; 8 paper colours.
- **Labels in shapes:** double-click (or double-tap, or press Enter on) a rectangle or ellipse to type inside it.
- **Connected arrows:** start or end an arrow on a shape, sticky, image or text and it attaches; move the shape and the arrow follows.
- **Images:** paste, drag in (also straight from other websites), or pick from Photos/Files (**+** or I). Images are resized and stored separately so boards stay quick to sync. New items find free space instead of landing on top of each other.
- **Moodboards:** paste or drop a web address to get a **link card** with the page's preview image, title and site (YouTube and Vimeo included); double-click or tap it to open the page. Add **colour swatches** with their hex code from **+ → Colour**, or select a photo and tap **Palette** to pull its main colours out as swatches. Double-click an image to **crop** it (the original is kept, so you can always widen the crop again). Select a few things and tap **Tidy up** to arrange them into neat masonry columns (several images added at once arrive tidied).
- **Auto alignment:** while moving, resizing or drawing, objects snap to the edges and centres of nearby objects (pink guide lines) and to equal spacing with their neighbours (pink markers showing the gap). Optional **Snap to grid** works in multiples of 8 (8 px steps at 100%, 16 or 24 when zoomed out; the dots show 24, 16 or 8 px depending on zoom), and arrow keys nudge by 8. Both are switches in the board menu, and holding ⌘/Ctrl places something freely. With 2+ items selected, **Align** lines them up (left / centre / right / top / middle / bottom) or spaces them evenly.
- **Style:** 8 colors (Apple system palette), 3 stroke weights, outline/tint/solid fill and 4 text sizes. When something is selected, a style bar appears above the toolbar.
- **Editing:** move, resize (Shift keeps proportions), duplicate (⌘D or Alt-drag), copy/paste, layer order, undo/redo and arrow-key nudging. **Group** with ⌘G (⇧⌘G to ungroup): a click selects the whole group, a double-click picks one item inside.
- **iPad + Apple Pencil:** pressure-sensitive ink. Once the Pencil is detected, your finger pans the board and a resting palm is ignored. Pinch with two fingers to zoom. Tapping with the Text tool opens the keyboard (Scribble works too).
- **Export:** PDF (vector, with Geist embedded), PNG and SVG. You can export the whole board or only the selection.
- **Boards & links:** every board gets its own short link (`/#k3v9x2pq7d4m`) and saves automatically. With cloud saving turned on (see below), that link opens the live board on any device. Recent boards are in the top-left menu, and **All boards** lists every board you have (searchable, with a small live preview of each), including ones made on your other devices.
- **Your boards on every device, no account:** board menu → **Connect your devices** shows your private **My Canvas link** (with a QR code to scan with your phone). Open it anywhere and all your boards appear there, with editing rights and your Pro; boards already on that device join the same list. On a new device you can also paste the link (**Connect your devices → Paste**). That's the way into an iPhone/iPad Home Screen app, which keeps its own storage and can't be opened by links. Save the link in your notes or password manager and you can always get your boards back, even if the browser forgets them.
- **Share (free):** a **view link** lets anyone see the board as it changes and make their own copy. Only you edit, so nobody overwrites anyone. Your private **owner link** (board menu) opens the board with editing rights on your other devices.
- **Edit together (Pro):** an **edit link** invites people to edit with you in real time: cursors with names, selections and drawings as they happen, avatars of who's there. Undo only undoes your own changes. The owner needs Pro; guests join free.
- **Welcome tour:** first-time visitors get a short animated welcome and three steps (Create, Everywhere, Together). On iPhone and iPad in Safari, a fourth step shows how to add Canvas to the Home Screen. It's shown once; add `?tour` to the address to see it again.
- **Light and dark mode** (follows the system by default). On iPad you can "Add to Home Screen" to use it full-screen like an app.

## Help centre

User help lives at **`/help/`** (e.g. `canvas-xyz.vercel.app/help/`), separate from the canvas. People reach it from the **?** button (bottom right) and "How this works" links in the device and Pro dialogs. The **?** button also shows shortcuts that fit the device (keyboard shortcuts with Mac or Windows keys, touch and Pencil gestures on iPad, touch gestures on iPhone) and replays the welcome tour. It has a topic page per subject, search, and light/dark mode.

**To edit it**, change the Markdown files in `help/` — one file per topic, each `## Heading` becomes a question with its own link. The top of each file sets its title, description, Lucide icon and order. `help/_index.md` holds the popular questions on the start page. Link to another topic with `topic:devices#question-id` and to the app with `app:`. The pages are built with the app (`npm run build`); with `npm run dev` they update on reload.

## Keyboard shortcuts

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| V | Select | ⌘Z / ⇧⌘Z | Undo / Redo |
| H or Space | Pan | ⌘D | Duplicate |
| P | Pen | ⌘C / ⌘V | Copy / Paste |
| E | Eraser | ⌫ | Delete |
| R / O | Rectangle / Ellipse | [ / ] | Send back / Bring front |
| A / L | Arrow / Line | ⇧1 / ⇧0 | Zoom to fit / 100% |
| N | Sticky note | Enter | Edit selected text / label |
| I | Insert image | ⌥ + drag | Duplicate while dragging |
| ⌥A / ⌥H / ⌥D | Align left / centre / right | ⌥W / ⌥V / ⌥S | Align top / middle / bottom |
| ⇧⌥H / ⇧⌥V | Space evenly across / down | ⌘ while dragging | Don't snap |
| T | Text (or double-click canvas) | ⌘ + scroll / pinch | Zoom |
| ? | Shortcuts & help | | |

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

**3. Turn on live collaboration (about 3 minutes, free tier)**

1. Sign up at [liveblocks.io](https://liveblocks.io) and create a project.
2. In the Liveblocks dashboard, open **API keys** and copy the **secret key**.
3. In your Vercel project: **Settings → Environment Variables** → add `LIVEBLOCKS_SECRET_KEY` with that value.
4. Redeploy: **Deployments → ⋯ → Redeploy**.

(The [Liveblocks integration](https://vercel.com/marketplace/liveblocks) on the Vercel Marketplace can add the key for you instead.)

Check it worked: open a board, click **Share → Copy link**, and open the link in another browser. You'll see each other's cursors.

Free plan: up to 10 people on a board at once, 500 active boards and 3,000 live minutes a month, with a small Liveblocks badge. To save minutes, only boards whose live link has been shared connect, and a board disconnects when its tab has been in the background for a minute.

**4. Canvas Pro: smoke test first, real payments later**

Until a Stripe key is added, Pro runs as a **smoke test** ("fake door"): people see the real offer (locked "Edit together", pricing, Continue button), but nobody is charged. Choosing a plan records the interest and unlocks free early access on that device. See the results at **`/#stats`** on your site: how many hit the Pro feature, looked at the offer and chose monthly or yearly (counted anonymously, once per device). Set `PRO_MODE=off` in Vercel to switch the paywall off entirely.

To take payments:

1. Create a [Stripe](https://dashboard.stripe.com) account. Keep **Test mode** on while you try it.
2. **Developers → API keys** → copy the **Secret key** (`sk_test_…`).
3. In Vercel: **Settings → Environment Variables** → add `STRIPE_SECRET_KEY`, then **Redeploy**.
4. Try it: **Share → Edit together → Upgrade to Pro**, and pay with the test card `4242 4242 4242 4242` (any future date, any CVC).

The app creates the "Canvas Pro" product and its prices in Stripe on first use ($6/month, $48/year). To change them, set `PRO_PRICE_MONTH` / `PRO_PRICE_YEAR` (in cents) and `PRO_CURRENCY` (e.g. `eur`). To take real payments, activate your Stripe account, switch to live mode, replace the key with the live one (`sk_live_…`) and redeploy.

Adding the key ends the smoke test: early-access unlocks stop working and those people see the real offer. There are no accounts: after paying, Pro is stored in the browser, and the **My Canvas link** (board menu → Connect your devices) brings it to your other devices along with your boards. **Manage subscription** opens Stripe's billing page to change or cancel.

**Other static hosts** (Netlify, GitHub Pages, …): upload `dist/` after `npm run build`. Everything works except cloud links, which need the `api/` function.

## How saving works

- **On the device, always.** Every change is saved in the browser (IndexedDB) right away, so the app works offline and opens instantly.
- **In the cloud, when it's turned on.** Shortly after you stop drawing, the board is uploaded (`api/board.js` → Redis), keyed by the random id in its link. Opening the link on another device downloads it. When you return to a tab, it picks up edits made elsewhere. The cloud icon next to the title shows the state: saving, saved, or offline (offline changes upload when you're back online).
- **No accounts.** A board's id is enough to view it. Editing needs its edit key, which only the owner / edit link carries (`#id.key`); the server keeps just a hash of it, and the app removes it from the address bar after opening. Boards with no edits for a year expire from the cloud.
- **My Canvas (your list of boards).** Each browser keeps a list of your boards, with their edit keys and your Pro pass. It's encrypted in the browser with a secret that exists only in your My Canvas link, then backed up (`api/library.js` → Redis), so the server stores it but can't read it. Opening the link on another device brings in the list; boards you add, rename or delete on one device show up on the others. The app also asks the browser to keep its storage, so Safari is less likely to clear it.
- **Live collaboration (when set up).** Shared boards also join a Liveblocks room that keeps everyone in sync in real time; changes merge per element, so two people can work on different things at the same time. Without Liveblocks, two people editing at the same moment: the last save wins.

## Project layout

```
src/
  controller.ts   pointer/pen/touch/wheel handling (all canvas gestures)
  geometry.ts     bounds, hit-testing, move/resize math
  render.ts       element → SVG primitives (shared by canvas and exports)
  export.ts       PDF / PNG / SVG export
  storage.ts      IndexedDB boards + share-link encoding
  cloud.ts        client for the cloud save endpoint
  assets.ts       image storage (device + cloud) and loading
  images.ts       image import: paste, drop, picker, downscaling
  layout.ts       wrapping / auto-fitting text in stickies and shapes
  bindings.ts     arrows attached to shapes
  snap.ts         smart guides, equal spacing and grid snapping
  moodboard.ts    link cards, web images, colour swatches, palettes
  placement.ts    finding free space for new items
  boards.ts       routing by URL, autosave, cloud sync, new/duplicate/delete
  collab.ts       live collaboration (Liveblocks room ⇄ local store, presence)
  pro.ts          Canvas Pro on the client (checkout, Pro token)
  library.ts      My Canvas: your encrypted list of boards, synced across devices
  store.ts        app state (zustand) with undo/redo
  help.ts         links to the help centre
  components/     toolbar, style bar, menus, overlays
help/             help centre: one Markdown file per topic, plus its CSS and search script
scripts/help.ts   builds help/*.md into the /help/ pages (a Vite plugin)
api/
  board.js        Vercel Function: GET / PUT / DELETE a board in Redis
  asset.js        Vercel Function: images, stored by content hash
  collab.js       Vercel Function: Liveblocks sign-in for a board's room (editors, Pro boards)
  pro.js          Vercel Function: Stripe Checkout, Pro status, billing portal
  _pro.js         Stripe helpers and signed Pro tokens
  unfurl.js       Vercel Function: link previews and images from other sites
  library.js      Vercel Function: stores your encrypted My Canvas list
  _redis.js       shared Redis (Upstash REST) helper
```

Built with Vite, React, TypeScript, [perfect-freehand](https://github.com/steveruizok/perfect-freehand), [Lucide](https://lucide.dev) icons, [Geist](https://vercel.com/font) (SIL OFL), jsPDF + svg2pdf.js.
