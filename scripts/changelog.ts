import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/**
 * /changelog/: everything Canvas does at a glance (grouped), and what changed
 * and when. Both come from content/changelog.json, filled in at build time so
 * the page is plain HTML. Every improvement adds an entry there (see CLAUDE.md).
 */

interface Feature {
  id: string
  name: string
  text: string
  added: string
}
interface Log {
  features: { group: string; icon: string; items: Feature[] }[]
  releases: { date: string; title: string; items: { text: string; feature?: string }[] }[]
}

const FILE = resolve(import.meta.dirname, '../content/changelog.json')
export const readLog = (): Log => JSON.parse(readFileSync(FILE, 'utf8'))

/** the newest release's date, for the app's quiet "what's new" dot */
export const latestChange = () => readLog().releases[0]?.date ?? ''

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

// lucide icons, drawn inline
const ICONS: Record<string, string> = {
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  present: '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/>',
  message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  devices: '<path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8"/><path d="M10 19v-3.96 3.15"/><path d="M7 19h5"/><rect width="6" height="10" x="16" y="12" rx="2"/>',
  pen: '<path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"/><path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"/><path d="m2.3 2.3 7.286 7.286"/><circle cx="11" cy="11" r="2"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  template: '<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="9" height="7" x="3" y="14" rx="1"/><rect width="5" height="7" x="16" y="14" rx="1"/>',
}
const icon = (name: string) =>
  `<svg class="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ICONS.sparkles}</svg>`

/** features added in the week before the newest release get a "New" badge */
const NEW_DAYS = 7

export function renderChangelog(log = readLog()) {
  const latest = log.releases[0]?.date ?? '1970-01-01'
  const isNew = (f: Feature) => (Date.parse(latest) - Date.parse(f.added)) / 864e5 <= NEW_DAYS
  const total = log.features.reduce((n, g) => n + g.items.length, 0)

  const overview = log.features
    .map(
      (g, i) => `<section class="cl-group" data-reveal style="--i: ${i % 3}">
        <h3>${icon(g.icon)}<span>${esc(g.group)}</span></h3>
        <ul>${g.items
          .map(
            (f) => `<li id="f-${esc(f.id)}"><b>${esc(f.name)}</b>${isNew(f) ? ' <span class="cl-new">New</span>' : ''}<span>${esc(f.text)}</span></li>`,
          )
          .join('')}</ul>
      </section>`,
    )
    .join('\n')

  const timeline = log.releases
    .map(
      (r) => `<article class="cl-release" data-reveal>
        <time datetime="${r.date}">${day(r.date)}</time>
        <div>
          <h3>${esc(r.title)}</h3>
          <ul>${r.items
            .map((it) => `<li>${esc(it.text)}${it.feature ? ` <a class="cl-see" href="#f-${esc(it.feature)}" aria-label="See it in the overview">↑</a>` : ''}</li>`)
            .join('')}</ul>
        </div>
      </article>`,
    )
    .join('\n')

  return { overview, timeline, total, updated: day(latest), groups: log.features.length }
}

/** Fill the changelog page's placeholders at build time (and in dev). */
export function changelogPage(): Plugin {
  return {
    name: 'changelog',
    transformIndexHtml(html, ctx) {
      if (!ctx.filename.replace(/\\/g, '/').includes('/changelog/')) return html
      const r = renderChangelog()
      return html
        .replace('<!--OVERVIEW-->', r.overview)
        .replace('<!--TIMELINE-->', r.timeline)
        .replaceAll('<!--TOTAL-->', String(r.total))
        .replaceAll('<!--GROUPS-->', String(r.groups))
        .replaceAll('<!--UPDATED-->', r.updated)
    },
  }
}
