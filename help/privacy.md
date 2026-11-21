---
title: Privacy & your data
description: What Canvas stores and where, who can see your boards, how long they are kept, and why shared boards never show up in search results.
icon: ShieldCheck
order: 10
---

## Do I need an account?

No. Canvas has no accounts, sign-ups or passwords, and never asks for your email. The only time it asks for a name is when you leave a note on someone else's board, so they know who it's from (any name will do). Boards are found by their random links, which are practically impossible to guess.

## What does Canvas store?

- **On your device:** your boards, the list of your boards, and settings like your theme.
- **In the cloud:** each board's content and images, so its link works on any device. The server stores a scrambled version (a hash) of each board's edit key, never the key itself.
- **Ideas you suggest:** on the [What's new](app:changelog/) page, the idea and, only if you add it, your email address, so you can hear when it's ready. Your email is never shown to anyone else. Votes are counted once per device, without knowing who you are.
- **Earlier versions:** a copy of each board as it was, kept at most once an hour while people work on it, for 30 days, with the name of whoever saved it. Only people who can edit the board can see them, and they're deleted with the board.
- **Voice notes:** recordings you add to a board are stored with it, like photos, and anyone with the board's link can play them. The microphone is only used while you record.
- **Feedback:** likes and notes left on a shared board, with the name the person typed, kept next to that board and deleted with it.
- **Your list of boards (My Canvas):** encrypted on your device with a secret that exists only in your My Canvas link, then backed up. Our server stores it but can't read it.

Nothing is saved until you add something. When Canvas opens, it asks the server whether the board in the address bar already exists. That's only a lookup: a new, untouched board is never stored, neither in your list of boards nor in the cloud.

## Who can see my boards?

Only people who have a board's link. Links contain a long random code, not the board's name, so they can't be guessed. A View link lets people see the board; an Edit together link or your My Canvas link lets people change it. Keep those two private.

When you paste a board link into a messaging or social app, the app shows a preview with the board's name, how many items it has and a small picture of the board (saved when you open Share), so it briefly reads those from Canvas. It never gets the edit key. Boards you haven't shared don't have a picture.

## Can my boards show up in Google or other search engines?

No. Even if someone posts a link to your board somewhere public, search engines are told not to list it, not to keep a copy and not to show its preview picture. The same goes for everything Canvas's server sends. Your board's edit key sits after the `#` in its link, which browsers never send to any server, search engines included. Only people you give a link to can find your board.

## How long are boards kept?

As long as you use them. A board that nobody has edited for a year is removed from the cloud (copies on your devices stay). Earlier versions of a board are kept for 30 days. Your encrypted list of boards is kept for two years after it was last used.

## What happens when I delete a board?

**Delete board** removes it from the cloud, for everyone with the link, and from the board lists on all your connected devices. This can't be undone.

## Do you have my email address?

Only if you asked for updates. Under **Connect your devices → Email it to me** you can tick **Also send me rare updates about Canvas**. Then your email address, and nothing else, goes on a short list for occasional news (a few times a year at most). It isn't linked to your boards or your devices. Every update will have a way to unsubscribe.

Backing up your link by email doesn't share your address with Canvas: it opens your own email app, and the email goes from there.

## Which other services does Canvas use?

- **Vercel** hosts the app.
- **Upstash** stores boards, images and your encrypted list of boards.
- **Liveblocks** keeps boards in sync when you edit together live.
- **Stripe** handles payments for Canvas Pro. Canvas never sees your card details.
- **Vercel Web Analytics** counts page visits, anonymously and without cookies.

When you add a link card, Canvas's server visits that web page to fetch its title and preview image.

Place cards: the map picture is drawn from OpenStreetMap when you add the card, and OpenStreetMap's Nominatim looks up the address (Canvas's server asks, not your browser). After that, the board never contacts a map service until someone taps a map to explore it; then Google Maps (for Google links) or OpenStreetMap (for Apple Maps links) loads.

Font cards use typefaces stored on Canvas itself; nothing is fetched from Google Fonts.

Videos and music on a board (YouTube, Vimeo, Loom, TikTok, Spotify, Apple Music, Apple Podcasts, SoundCloud, Bandcamp, Deezer, Mixcloud) load nothing from those services until someone presses play. Only then does that service's own player open in the card, under its own privacy policy. YouTube plays in its privacy-enhanced mode and Vimeo is asked not to track.

## Does Canvas track me?

No ads and no tracking cookies. Canvas uses Vercel Web Analytics to count visits to its pages anonymously and without cookies. Only the page is counted (like the app, the front page or a help page) — never which board you opened, and never the private part of a link. To learn whether people want Canvas Pro, Canvas also counts anonymously how often its offer is seen and chosen, using a random ID for each browser.
