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
2. **Board history**: "see this board as it was yesterday" and restore it, as a safety net now that people share edit links and leave feedback.
3. Works offline (the Home Screen app opens without internet).
4. Keyword pages, if search data later shows demand: moodboard maker, whiteboard for iPad with Apple Pencil, presenting from a whiteboard.

Decided against for now: a "send photos from your phone" QR handoff (people rarely use two devices at once; adding photos on the phone directly was polished instead).
