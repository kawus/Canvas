# Working on Canvas

Canvas is a calm, minimal whiteboard (canvas.kawus.com). The person who owns it is a product manager, not a programmer: explain changes in plain language, without jargon.

## Always keep the changelog up to date

Every change people will notice (a feature, an improvement, a fix) adds an entry to **`content/changelog.json`** in the same commit:

- **`releases`** (newest first): add the change under today's date, creating a new release (with a short, warm title) if today has none yet. One plain sentence per change, written for people using Canvas, not for developers. Add `"feature": "<id>"` when it belongs to a feature in the overview.
- **`features`**: when the change is a new capability, add it to the right group (or a new group with one of the icons in `scripts/changelog.ts`), with `added` set to today. Update a feature's text when its behaviour changes.
- Purely internal work (tests, refactors, notes, tooling) doesn't go in the changelog.

The changelog becomes the page at `/changelog/` ("What's new": everything Canvas does at a glance, then every release) and the quiet "what's new" dot on the app's **?** button. Both update by themselves from that file.

## Also keep in step

- **Help centre** (`help/*.md`): add or update the answer for anything people will look for.
- **Templates** follow the shared template language in `docs/templates.md`; boards are built by `node scripts/make-templates.cjs`.
- **To-do list for the owner**: `docs/next-steps.md`.

## Conventions

- British spelling, short sentences, a calm voice. No exclamation marks in the product.
- Privacy first: no accounts, nothing personal sent to other services, people's boards never in search results.
- Run `npx tsc -b`, `npm run lint` and `npm run build` before committing.
