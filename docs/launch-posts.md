# Canvas launch posts (drafts)

Angle everywhere: **no account, private by design, and the board is the deck.**
Attach the teaser videos where the platform allows (landscape for Product Hunt / X / LinkedIn, vertical for Instagram / TikTok / Stories).

Before posting:
- Post on a weekday morning US time for Show HN and Product Hunt (Product Hunt resets at 00:01 Pacific).
- Be around for the first 2–3 hours to answer comments. Replies matter more than the post.
- Check each subreddit's self-promotion rules first (most allow "I made this" posts on certain days or with flair).

---

## 1. Show HN

**Title** (80 characters max)

> Show HN: Canvas – a calm whiteboard with no accounts where the board is the deck

**Link:** https://canvas.kawus.com

**First comment** (post it yourself right after submitting)

> Hi HN, I'm a product manager, and I built Canvas as a side project to see how far I could get building a real product myself.
>
> It's a minimal whiteboard for sketching, planning and moodboards that works in the browser on Mac, iPad (Apple Pencil, pressure-sensitive) and iPhone. There's no sign-up: you open it and draw.
>
> A few things I cared about:
>
> - **No accounts, private by design.** A board lives at a random link. The edit key sits after the # (so it never reaches the server), and the server only stores a hash of it. To get your boards on other devices, there's a "My Canvas" link: your list of boards is encrypted in the browser with a secret that exists only in that link, so the server stores it but can't read it.
> - **The board is the deck.** You can mark parts of the board as slides and press Play. It flies from slide to slide, pulling back far enough to show where each one sits on the board. It's built on the smooth zoom path by van Wijk & Nuij.
> - **Moodboard tools:** paste a link to get a card with its preview, pull a colour palette out of a photo, crop, and "tidy up" a pile of images into neat columns.
> - Exports to PDF (vector), PNG and SVG, light and dark mode, and a help centre.
>
> Stack: Vite + React, SVG rendering, perfect-freehand for ink, Upstash Redis on Vercel for sync, and Liveblocks for optional live co-editing.
>
> I'd love feedback, especially on presenting: does flying between slides help you explain things, or is it a gimmick?

*(Optional honesty line, if you want it: "I'm not a programmer. I built this with an AI coding assistant, which was its own interesting experiment." HN tends to respect that when it's said plainly.)*

---

## 2. Product Hunt

**Name:** Canvas

**Tagline** (60 characters max)

> A calm, no-account whiteboard where the board is the deck

**Description** (260 characters max)

> Sketch, plan and build moodboards on Mac, iPad and iPhone, with no sign-up. Mark parts of your board as slides and press Play: Canvas glides between them so everyone sees the big picture. Private by design, with Apple Pencil support.

**Topics:** Design Tools · Productivity · Presentation

**Gallery** (in this order)
1. The landscape teaser video
2. A board with photos, sticky notes and slide frames
3. Presenting: one slide, full screen
4. The overview at the end of a presentation
5. iPad with Apple Pencil
6. Moodboard: link cards, palette from a photo, tidy up

**Maker's first comment**

> Hey Product Hunt 👋
>
> I made Canvas because most whiteboards ask for an account before you've drawn a single line, and then feel busy once you're in. Canvas opens straight onto a calm board.
>
> The new part I'm most excited about: **your board is the deck.** Frame a few parts of your board as slides, press Play, and Canvas flies from one to the next, so your audience sees how everything fits together.
>
> It's private by design. There are no accounts, edit keys never reach the server, and your list of boards is encrypted on your device.
>
> It's free to use. If you love it, there's an optional one-time **Founder licence**: live editing together, no "Made with Canvas" mark, and every future Pro feature, with no subscription. I'd love to hear what you'd make with it, and what's missing.

---

## 3. Reddit

### r/ipad (also r/ipadPro, r/applepencil)

**Title**

> I made a calm whiteboard for iPad that turns your board into a presentation (no account, works with Apple Pencil)

**Text**

> Hi! I've been building Canvas, a minimal whiteboard that runs in Safari. You can add it to your Home Screen and it opens full screen, like an app.
>
> - The Apple Pencil always draws, even with the Select tool picked, and your palm is ignored. Your finger moves the board around.
> - Moodboards: paste photos and links, pull colour palettes from photos, tidy everything into neat columns.
> - New: mark parts of the board as slides and press Play. It glides from slide to slide. Great on a TV with AirPlay.
> - No account. Your boards sync to your iPhone and Mac with a private link.
>
> It's free: https://canvas.kawus.com. I'd really like to know how it feels with a Pencil.

### r/SideProject

**Title**

> I'm a PM, not a programmer, and I built a whiteboard where the board is the deck

**Text**

> Canvas is a calm whiteboard with no accounts. My favourite part to build was presenting: mark parts of the board as slides, press Play, and it flies between them along the same kind of path map apps use (zoom out, glide, zoom in).
>
> What I learned shipping it:
> 1. Privacy can be a feature people notice. The server can't read your list of boards.
> 2. Polish is cheap now. Positioning isn't.
>
> Feedback welcome: https://canvas.kawus.com

---

## 4. LinkedIn

> I've spent years writing specs for other people to build. This year I started building products myself.
>
> Canvas is a calm whiteboard for sketching, planning and moodboards, with no account needed. The newest feature: **your board is the deck.** Mark a few parts of your board as slides, press Play, and it glides from one to the next, so everyone sees the bigger picture behind each slide.
>
> A few product decisions I'm proud of:
> → No sign-up, ever. You open it and start drawing.
> → Private by design: the server can't read your list of boards.
> → It feels at home on iPad with Apple Pencil.
>
> Try it: canvas.kawus.com. I'd love your feedback.
>
> *(attach the landscape teaser)*

---

## 5. X / Threads / Bluesky

> Your whiteboard is now your slide deck.
>
> Mark a few parts of your board, press Play, and Canvas flies between them, so everyone sees how it all fits together.
>
> No account. Private by design. Mac, iPad, iPhone.
> canvas.kawus.com
>
> *(attach the landscape teaser)*

---

## Kill rule: Canvas, the lab's first project

**The rule (in your words):** Canvas is a trial and a way to learn how to run a product lab. Interest counts for more than paying customers. **If the project is net positive, it clears the bar.**

**Monthly check (about 10 minutes):**

1. **Is there interest?** Look at these four numbers. It's alive if they're growing or holding.
   - Visitors per month (Vercel Analytics).
   - Returning devices: people coming back to their boards (stats page).
   - Visits from shared boards and exports: **/made-with-canvas/** in Vercel Analytics.
   - Feedback nobody asked for: replies, comments, emails.
2. **Is it net positive?** Monthly income (Pro, tips, a founder licence) against monthly costs (Vercel, Upstash Redis, Liveblocks, domain).
   - Income ≥ costs → **clears the bar**, whatever the interest.
3. **Freeze** only after two monthly checks in a row where interest dropped **and** it cost money. Freezing means it stays online as a portfolio piece and building stops.
4. **What the lab learned:** five lines after each check on what carries over to the next project.

| Month | Visitors | Returning devices | /made-with-canvas/ | Unprompted feedback | Income | Costs | Net | Lesson for the lab |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (baseline) | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
