---
title: Privacy & your data
description: What Canvas stores, where, and for how long.
icon: ShieldCheck
order: 10
---

## Do I need an account?

No. Canvas has no accounts, sign-ups or passwords, and doesn't ask for your name or email. Boards are found by their random links, which are practically impossible to guess.

## What does Canvas store?

- **On your device:** your boards, the list of your boards, and settings like your theme.
- **In the cloud:** each board's content and images, so its link works on any device. The server stores a scrambled version (a hash) of each board's edit key, never the key itself.
- **Your list of boards (My Canvas):** encrypted on your device with a secret that exists only in your My Canvas link, then backed up. Our server stores it but can't read it.

## Who can see my boards?

Only people who have a board's link. Links contain a long random code, not the board's name, so they can't be guessed. A View link lets people see the board; an owner link, an Edit together link or your My Canvas link lets people change it. Keep the last three private.

When you paste a board link into a messaging or social app, the app shows a preview with the board's name and how many items it has, so it briefly reads those from Canvas. It never sees the board's content or the edit key.

## How long are boards kept?

As long as you use them. A board that nobody has edited for a year is removed from the cloud (copies on your devices stay). Your encrypted list of boards is kept for two years after it was last used.

## What happens when I delete a board?

**Delete board** removes it from the cloud, for everyone with the link, and from the board lists on all your connected devices. This can't be undone.

## Which other services does Canvas use?

- **Vercel** hosts the app.
- **Upstash** stores boards, images and your encrypted list of boards.
- **Liveblocks** keeps boards in sync when you edit together live.
- **Stripe** handles payments for Canvas Pro. Canvas never sees your card details.
- **Vercel Web Analytics** counts page visits, anonymously and without cookies.

When you add a link card, Canvas's server visits that web page to fetch its title and preview image.

## Does Canvas track me?

No ads and no tracking cookies. Canvas uses Vercel Web Analytics to count visits to its pages anonymously and without cookies. Only the page is counted (like the app, the front page or a help page) — never which board you opened, and never the private part of a link. To learn whether people want Canvas Pro, Canvas also counts anonymously how often its offer is seen and chosen, using a random ID for each browser.
