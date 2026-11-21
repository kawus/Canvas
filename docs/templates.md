# The template language

Every Canvas template speaks the same creative language, so they feel like one family. The boards are built by `scripts/make-templates.cjs` (run `node scripts/make-templates.cjs`), which holds the shared parts once; the pages live in `templates/<name>/index.html`.

## The board

1. **Opening slide** (`b.opening`): a big title (88), a "Kind · Who · Date" line in grey (32), three question stickies in yellow, green and blue (200 wide), one large photo spot on the right, and the line "Paste photos straight onto the board, or drag them in from a website."
2. **Mood** (`b.mood`): a 3 × 2 grid of image spots, each with a short label.
3. **The details**: palette and type (`b.paletteType`: five swatches, "Aa", a headline and body sample, a "Why these?" sticky), or the project's own equivalent (materials, logo sketches).
4. **The plan** (`b.plan`): three numbered steps ("1 · …") in blue, violet and green, joined by arrows, with one question sticky under them.
5. **Beside the slides** (`b.extras`): "Ideas for later" (yellow) and the tip "Tap Present, then Play, to walk everyone through it" (blue).

Slides are 1280 × 720, in two columns (x 0 and 1480), rows 900 apart. Section titles are 64; a supporting line is 30 in grey. Image spots are grey, tinted, with a 22-point label.

## The voice

- Stickies ask short, warm questions written for the person filling them in: "What we stand for", "What feels wrong?", not "Mission statement".
- Labels are plain nouns: "Mood", "Palette & type", "Next steps".
- British spelling, no jargon, no exclamation marks.

## The page

- Title: "<Name> template (free, no sign-up) · Canvas"; description about 150 characters, saying what's on the board and "Free, no account."
- Hero: eyebrow "Free template · <Name>", a heading as a verb phrase with a grey second half ("Shape a brand identity <span>on one calm board.</span>"), one lead sentence, "Use the free template" and "Start with a blank board".
- The presenting film, then **Collect → Arrange → Present**, the same three verbs on every page.
- "Calm by design": No account, Private by design, On every screen, and one point for this audience.
- Five questions: always "Is it free?" and "Can I export it?", plus three for the audience; the same questions go in the page's FAQ structured data.
- Final call: "Your next <thing>, on one board."
- Add the template to the templates hub (`templates/index.html`), the sitemap and build list (`vite.config.ts`), and the intro footer.
