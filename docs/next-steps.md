# Canvas: where we left off (22 Nov 2026)

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

0. Move the Vercel project to the **Pro** plan first: the free Hobby plan is for non-commercial use only, and selling licences is commercial. Then set a monthly spending limit (**Settings → Billing → Spend Management**).
1. Vercel → **Settings → Environment Variables** → add **`PRO_TOKEN_SECRET`**: a long random value from your password manager's generator (at least 32 characters; payments won't start without it). Never change it later.
2. Add **`STRIPE_SECRET_KEY`** with your Stripe **test** key (`sk_test_…`), redeploy, and buy the licence with the test card `4242 4242 4242 4242`.
3. In Stripe: **Settings → Customer emails → Successful payments** on, so buyers get a receipt.
4. Go live: activate your Stripe account, replace the key with the live one (`sk_live_…`), redeploy.

Keys go only into Vercel, never into chat or the project.

## 2b. Switch on your Ideas board (5 minutes)

The What's new page has an **Ideas & requests** board: visitors suggest ideas and vote, and you move the ideas along.

1. Vercel → **Settings → Environment Variables** → add **`IDEAS_ADMIN_KEY`**: a long random value from your password manager (at least 12 characters). Redeploy.
2. Open **canvas.kawus.com/changelog/?admin**, paste the key once. It's remembered on that device (do it on your phone too). The same key opens your Pro numbers at **canvas.kawus.com/#stats**. After 10 wrong tries from one place, the key is refused there for an hour, so it can't be guessed.
3. The board has four columns, always in this order: **Inbox**, **Planned**, **Working on**, **Delivered**. Every suggestion goes straight into **Inbox**, where everyone can see it and vote. In your view, each idea has a menu to move it to another column, and **Remove** for anything that doesn't belong (spam, or ideas that don't fit). Inbox ideas also show the date and, if they left one, the person's email; only you see that.

**A 10-minute weekly habit:**
- Look through the **Inbox**: move the good ideas to **Planned**, remove what doesn't fit (without guilt). Votes show what people want most: the top of **Planned** is your next build.
- Move what you're building to **Working on**: it shows people the product is alive.
- When something ships, mark it **Delivered** and ask Claude to add it to the changelog. A short personal "it's ready" email to whoever suggested it (their email shows on the idea in your view) is the best way to turn them into fans, and a reason to post on Instagram.

## 2b+. Check your owner key and set a spending limit (5 minutes)

From the November security review:

- **Owner key:** make sure `IDEAS_ADMIN_KEY` in Vercel is a long random value from your password manager, not a word or phrase. It now also guards your Pro numbers.
- **When you send an update** to the updates list (or email someone about their idea), end it with: *Don't want these? canvas.kawus.com/unsubscribe*. Privacy law expects a way off the list in every email.
- **Spending limit:** not needed on Vercel's free (Hobby) plan: it never charges, it pauses the site until the next month if a limit is reached. The fair-use limits are there to keep that from happening. If you move to Vercel Pro (needed before selling the Founder licence, as Hobby is for non-commercial use only), set a limit then under **Settings → Billing → Spend Management**. The same goes for Upstash and Liveblocks: free plans don't charge; set a budget if you ever upgrade.

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
2. Works offline (the Home Screen app opens without internet).
3. Keyword pages, if search data later shows demand: moodboard maker, whiteboard for iPad with Apple Pencil, presenting from a whiteboard.

Built: font cards, place cards (maps from OpenStreetMap, addresses from its Nominatim service, both used lightly as their rules allow, with credit on the map) and voice notes.

Decided against for now: a "send photos from your phone" QR handoff (people rarely use two devices at once; adding photos on the phone directly was polished instead); more shapes and board background colours (they'd chip away at the simplicity).
