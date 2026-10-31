import fs from 'node:fs'
import path from 'node:path'
import { Marked, type Tokens } from 'marked'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as lucide from 'lucide-react'
import type { Plugin } from 'vite'

/**
 * The help centre (/help/): one Markdown file per topic in help/, turned into
 * plain static pages with the app's look, plus a search index. Kept apart from
 * the canvas app so it loads instantly and works without JavaScript.
 *
 * In the Markdown, link to another topic with `topic:<slug>#<question-id>`
 * and to the app with `app:`.
 */

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'help')
const FONT = path.join(ROOT, 'src/assets/fonts/Geist-Variable.woff2')

interface Topic {
  slug: string
  title: string
  description: string
  icon: string
  order: number
  html: string
  questions: { id: string; title: string; text: string }[]
}

interface Page {
  file: string
  html: string
}

function frontmatter(source: string) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(source)
  const data: Record<string, string> = {}
  if (!m) return { data, body: source }
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return { data, body: source.slice(m[0].length) }
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '’')
    .replace(/\s+/g, ' ')
    .trim()

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function icon(name: string, className = '') {
  const Icon = (lucide as unknown as Record<string, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>>)[name]
  if (!Icon) throw new Error(`help: unknown icon "${name}"`)
  return renderToStaticMarkup(createElement(Icon, { className, 'aria-hidden': true }))
}

/** Markdown → HTML, with ids on questions and links resolved from `depth` folders down. */
function render(markdown: string, depth: number) {
  const up = '../'.repeat(depth)
  const questions: Topic['questions'] = []
  const marked = new Marked()
  marked.use({
    renderer: {
      heading(this: { parser: { parseInline: (t: Tokens.Heading['tokens']) => string } }, { tokens, depth: level }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens)
        if (level !== 2) return `<h${level}>${inner}</h${level}>\n`
        const id = slugify(inner)
        questions.push({ id, title: plain(inner), text: '' })
        return `<h2 id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this question">#</a>${inner}</h2>\n`
      },
      link(this: { parser: { parseInline: (t: Tokens.Link['tokens']) => string } }, { href, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens)
        let url = href
        if (href.startsWith('topic:')) {
          const [slug, hash] = href.slice(6).split('#')
          url = `${up}${slug}/${hash ? `#${hash}` : ''}`
        } else if (href.startsWith('app:')) url = `${up}../${href.slice(4)}`
        const external = /^https?:/.test(url)
        return `<a href="${escape(url)}"${external ? ' target="_blank" rel="noopener"' : ''}>${inner}</a>`
      },
    },
  })
  const html = marked.parse(markdown, { async: false })
  // the text under each question, for search
  const parts = html.split(/<h2 id="/)
  parts.slice(1).forEach((part, i) => {
    const body = part.slice(part.indexOf('</h2>') + 5)
    questions[i].text = plain(body).slice(0, 400)
  })
  return { html, questions }
}

function loadTopics(): Topic[] {
  return fs
    .readdirSync(SRC)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((file) => {
      const { data, body } = frontmatter(fs.readFileSync(path.join(SRC, file), 'utf8'))
      const { html, questions } = render(body, 1)
      return {
        slug: file.replace(/\.md$/, ''),
        title: data.title ?? file,
        description: data.description ?? '',
        icon: data.icon ?? 'FileText',
        order: Number(data.order ?? 99),
        html,
        questions,
      }
    })
    .sort((a, b) => a.order - b.order)
}

const THEME_SCRIPT = `<script>try{var t=localStorage.getItem('canvas-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>`

function shell({ title, description, depth, body, search = true }: { title: string; description: string; depth: number; body: string; search?: boolean }) {
  const up = '../'.repeat(depth)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}" />
<meta name="theme-color" content="#fbfbfb" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#161618" media="(prefers-color-scheme: dark)" />
<link rel="icon" type="image/svg+xml" href="${up}../favicon.svg" />
<link rel="apple-touch-icon" href="${up}../apple-touch-icon.png" />
<link rel="preload" href="${up}geist.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="${up}help.css" />
${THEME_SCRIPT}
</head>
<body>
<header class="top">
  <a class="brand" href="${up}">
    <svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="6.5" class="logo-bg"/><path d="M7 15.5c2.2-4.6 4.2-7 6-7 2.4 0-1.6 7 1.2 7 1.1 0 2-1 2.8-2.4" class="logo-ink"/></svg>
    <span>Canvas <span class="brand-sub">Help</span></span>
  </a>
  ${search ? searchBox(depth, false) : '<span class="top-spacer"></span>'}
  <a class="open-app" href="${up}../">${icon('PenLine')}<span>Open Canvas</span></a>
</header>
${body}
<footer class="foot">
  <a href="${up}">Help centre</a>
  <a href="${up}privacy/">Privacy &amp; your data</a>
  <a href="${up}../">Open Canvas</a>
</footer>
<script src="${up}help.js" defer></script>
</body>
</html>
`
}

function searchBox(depth: number, big: boolean) {
  return `<div class="search ${big ? 'search-big' : ''}" data-root="${'../'.repeat(depth)}">
    ${icon('Search', 'search-icon')}
    <input type="search" placeholder="${big ? 'Search for answers — e.g. “share”, “iPad”, “PDF”' : 'Search help'}" aria-label="Search help" autocomplete="off" spellcheck="false" />
    <kbd class="search-kbd">/</kbd>
    <div class="results" role="listbox" hidden></div>
  </div>`
}

function topicPage(topic: Topic, topics: Topic[]): Page {
  const i = topics.indexOf(topic)
  const prev = topics[i - 1]
  const next = topics[i + 1]
  const nav = topics
    .map((t) => `<a href="../${t.slug}/" class="${t === topic ? 'is-active' : ''}"${t === topic ? ' aria-current="page"' : ''}>${icon(t.icon)}<span>${escape(t.title)}</span></a>`)
    .join('\n')
  const toc = topic.questions.map((q) => `<a href="#${q.id}">${escape(q.title)}</a>`).join('\n')
  const pager = `<nav class="pager">
    ${prev ? `<a class="pager-prev" href="../${prev.slug}/"><small>Previous</small>${escape(prev.title)}</a>` : '<span></span>'}
    ${next ? `<a class="pager-next" href="../${next.slug}/"><small>Next</small>${escape(next.title)}</a>` : '<span></span>'}
  </nav>`
  const body = `<div class="layout">
  <nav class="side" aria-label="Help topics">
    <a href="../" class="side-home">${icon('LifeBuoy')}<span>All topics</span></a>
    ${nav}
  </nav>
  <main class="article">
    <div class="crumbs"><a href="../">Help</a> <span>/</span> ${escape(topic.title)}</div>
    <h1>${escape(topic.title)}</h1>
    <p class="lead">${escape(topic.description)}</p>
    ${topic.html}
    ${pager}
  </main>
  ${topic.questions.length > 2 ? `<aside class="toc" aria-label="On this page"><div class="toc-title">On this page</div>${toc}</aside>` : ''}
</div>`
  return {
    file: `help/${topic.slug}/index.html`,
    html: shell({ title: `${topic.title} — Canvas Help`, description: topic.description, depth: 1, body }),
  }
}

function indexPage(topics: Topic[]): Page {
  const { data, body } = frontmatter(fs.readFileSync(path.join(SRC, '_index.md'), 'utf8'))
  const { html } = render(body, 0)
  const cards = topics
    .map(
      (t) => `<a class="card" href="${t.slug}/">
      <span class="card-icon">${icon(t.icon)}</span>
      <span class="card-title">${escape(t.title)}</span>
      <span class="card-desc">${escape(t.description)}</span>
    </a>`,
    )
    .join('\n')
  const page = `<main class="home">
  <section class="hero">
    <h1>${escape(data.title ?? 'How can we help?')}</h1>
    <p class="lead">${escape(data.description ?? '')}</p>
    ${searchBox(0, true)}
  </section>
  <section class="cards" aria-label="Topics">${cards}</section>
  <section class="popular">${html}</section>
</main>`
  return {
    file: 'help/index.html',
    html: shell({ title: 'Canvas Help', description: data.description ?? 'Answers to your questions about Canvas.', depth: 0, body: page, search: false }),
  }
}

/** Every file of the help centre, keyed by its path in the build output. */
export function buildHelp(): Map<string, string | Buffer> {
  const topics = loadTopics()
  const files = new Map<string, string | Buffer>()
  for (const p of [indexPage(topics), ...topics.map((t) => topicPage(t, topics))]) files.set(p.file, p.html)
  const index = topics.flatMap((t) => [
    { t: t.title, h: t.title, u: `${t.slug}/`, x: t.description },
    ...t.questions.map((q) => ({ t: t.title, h: q.title, u: `${t.slug}/#${q.id}`, x: q.text })),
  ])
  files.set('help/search.json', JSON.stringify(index))
  files.set('help/help.css', fs.readFileSync(path.join(SRC, 'help.css'), 'utf8'))
  files.set('help/help.js', fs.readFileSync(path.join(SRC, 'help.js'), 'utf8'))
  files.set('help/geist.woff2', fs.readFileSync(FONT))
  return files
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

export function helpPages(): Plugin {
  return {
    name: 'canvas-help',
    // `vite dev`: build the pages on each request, so edits show on reload
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (url !== '/help' && !url.startsWith('/help/')) return next()
        if (url === '/help' || (!path.extname(url) && !url.endsWith('/'))) {
          res.statusCode = 301
          res.setHeader('Location', `${url}/`)
          return res.end()
        }
        const file = url.slice(1) + (url.endsWith('/') ? 'index.html' : '')
        const body = buildHelp().get(file)
        if (body === undefined) return next()
        res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream')
        res.end(body)
      })
    },
    generateBundle() {
      for (const [fileName, source] of buildHelp()) this.emitFile({ type: 'asset', fileName, source })
    },
  }
}
