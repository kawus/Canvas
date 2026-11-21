# Canvas: where we left off (20 Nov 2026)

Your to-do list, in order. Everything here is for you to do; nothing in this folder is shown on the site.

## 1. Google Search Console (about 15 minutes)

Google needs proof that you own kawus.com before it shows you search data. You prove it with a "TXT record": a short line of text in your domain's settings that Google gives you and then looks for. It changes nothing about the site or your email.

Your domain's settings are at **GoDaddy** (kawus.com uses GoDaddy's name servers, "domaincontrol.com"; Vercel only runs the canvas part).

1. Go to [search.google.com/search-console](https://search.google.com/search-console), add a property, choose **Domain** (the left option) and type `kawus.com`. Copy the code it shows (`google-site-verification=…`).
2. At GoDaddy: log in → **My Products** → **kawus.com** → **DNS** (or "Manage DNS").
3. **Add New Record**: Type **TXT**, Name **`@`**, Value: the code from Google, TTL as it is. **Save**. Don't change the records already there (one of them points canvas to Vercel).
4. Back in Search Console, click **Verify**. Often minutes, sometimes a few hours: if it fails, try again later.
5. Then in Search Console:
   - **Sitemaps** → add `https://canvas.kawus.com/sitemap.xml`
   - **URL inspection** → request indexing for `https://canvas.kawus.com/`, `/intro/` and `/templates/`
6. [Bing Webmaster Tools](https://www.bing.com/webmasters): sign in and **import from Google Search Console** (one click). This also covers DuckDuckGo and ChatGPT search.

What to expect: impressions show up in Search Console within one or two weeks; real rankings take a month or two. "Canvas" alone competes with Canva and Canvas LMS, so most visitors from search will come through specific pages (templates, help).

## 2. Turn on payments for the Founder licence (about 20 minutes)

Until this is done, the Founder licence is a "smoke test": people see the offer but nobody can pay. Full steps are in the README (section on Canvas Pro); in short:

1. Vercel → **Settings → Environment Variables** → add **`PRO_TOKEN_SECRET`**: a long random value from your password manager's generator. Never change it later.
2. Add **`STRIPE_SECRET_KEY`** with your Stripe **test** key (`sk_test_…`), redeploy, and buy the licence with the test card `4242 4242 4242 4242`.
3. In Stripe: **Settings → Customer emails → Successful payments** on, so buyers get a receipt.
4. Go live: activate your Stripe account, replace the key with the live one (`sk_live_…`), redeploy.

Keys go only into Vercel, never into chat or the project.

## 2b. Switch on your Ideas board (5 minutes)

The What's new page has an **Ideas & requests** board: visitors suggest ideas and vote, and you move the ideas along.

1. Vercel → **Settings → Environment Variables** → add **`IDEAS_ADMIN_KEY`**: a long random value from your password manager (at least 12 characters). Redeploy.
2. Open **canvas.kawus.com/changelog/?admin**, paste the key once. It's remembered on that device (do it on your phone too).
3. The board has four columns, always in this order: **Inbox**, **Planned**, **Working on**, **Delivered**. Every suggestion goes straight into **Inbox**, where everyone can see it and vote. In your view, each idea has a menu to move it to another column, and **Remove** for anything that doesn't belong (spam, or ideas that don't fit). Inbox ideas also show the date and, if they left one, the person's email; only you see that.

**A 10-minute weekly habit:**
- Look through the **Inbox**: move the good ideas to **Planned**, remove what doesn't fit (without guilt). Votes show what people want most: the top of **Planned** is your next build.
- Move what you're building to **Working on**: it shows people the product is alive.
- When something ships, mark it **Delivered** and ask Claude to add it to the changelog. A short personal "it's ready" email to whoever suggested it (their email shows on the idea in your view) is the best way to turn them into fans, and a reason to post on Instagram.

## 2c. Mark "Board history" as Delivered (1 minute)

Earlier versions (board history) is live. On **canvas.kawus.com/changelog/?admin**, move the **Board history** idea to **Delivered**.

## 3. Launch week

- Posts are drafted in [launch-posts.md](launch-posts.md): Show HN, Product Hunt, Reddit, LinkedIn, X/Threads/Bluesky, plus the monthly kill-rule check.
- New angle since the drafts: **feedback without accounts** (friends like things and leave notes on a view link, with just a name).
- Videos: the 16:9 presenting teaser is at `/media/present-teaser.mp4` on the site. The 16:9 feedback teaser and the Instagram Reels were sent to you in our chat: download them from there, as the working copies are temporary.
- Post Show HN and Product Hunt on a weekday morning US time, and stay around for 2–3 hours to answer comments.

## 4. Free listings (visitors and links back to the site)

- **AlternativeTo**: list Canvas as an alternative to Miro, FigJam, Milanote and Excalidraw (people search "free Miro alternative").
- SaaSHub, BetaList, Indie Hackers.

## 5. Instagram

The plan is in [instagram-plan.md](instagram-plan.md). Its dates started on Wed 11 Nov, which has passed: pick a launch day and shift the calendar from there (ask Claude to re-date it and refresh the Reels with the warm look).

## 6. Try on your iPhone

- Home Screen app: the "Connect this app to your boards" card → **Scan code** → point it at the QR code under Connect your devices on your Mac.
- **+ → Photos** with several photos: "Adding … photos", then a summary, and they land in view.
- Live editing: you should appear only once (no more stacked "BT" avatars).

## Ideas for what to build next

1. **More templates** (each one is a new way in from Google): kitchen renovation moodboard, wedding moodboard. (Brand identity is done.) Follow `docs/templates.md`.
2. **More things to collect on a board** (in the family of photos, links, colours, videos and music). Each is chosen and built on its own:
   - **Font cards:** **+ → Font**, pick from a curated set of about 30 typefaces stored on Canvas itself (nothing sent to Google). The card shows a big "Aa", the font's name and a sample line. Pairs with colour swatches in the brand and client templates, where "Palette & type" currently means typing a font name.
   - **Place cards:** recognised from a pasted Google Maps or Apple Maps link, just like videos and music (no extra button): the place's name, address and a small map; tapping opens directions. For venues, trips, shops and shoot locations. The map must not send visitors' details to Google (a stored map picture, not a live map).
   - **Voice notes:** **+ → Voice note**: hold to record a short note (up to about a minute) that sits on the board as a small play button with its length. For explaining a board to a client, or feedback without typing. Stored like images; the microphone is only asked for when someone records.
3. Works offline (the Home Screen app opens without internet).
4. Keyword pages, if search data later shows demand: moodboard maker, whiteboard for iPad with Apple Pencil, presenting from a whiteboard.

Decided against for now: a "send photos from your phone" QR handoff (people rarely use two devices at once; adding photos on the phone directly was polished instead); more shapes and board background colours (they'd chip away at the simplicity).
