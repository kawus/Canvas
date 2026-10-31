import { redis, redisConfig } from './_redis.js'

/**
 * Board links (/b/<id>, rewritten here by vercel.json). Messaging and social
 * apps read this page for the link preview: the board's own name and what's
 * on it. People are sent straight on to the board (/#<id>); an edit key in
 * the link's #fragment never reaches this server and is passed along as is.
 *
 * GET /api/share?id=<board id>
 */

const ID_RE = /^[a-z0-9]{4,32}$/

/** @param {string} s */
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** @param {number} n @param {string} one @param {string} many */
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** "12 items: photos, sticky notes and links" @param {{ type?: string, highlight?: boolean }[]} elements */
function describe(elements) {
  if (!elements.length) return 'An empty board, ready for ideas.'
  /** @type {Record<string, string>} */
  const kinds = { image: 'photos', sticky: 'sticky notes', link: 'links', swatch: 'colours', freedraw: 'drawings', text: 'notes', rect: 'shapes', ellipse: 'shapes', arrow: 'arrows', line: 'lines' }
  /** @type {Map<string, number>} */
  const seen = new Map()
  for (const e of elements) {
    const k = kinds[e.type ?? '']
    if (k) seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  const top = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k)
  const list = top.length > 1 ? `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}` : top[0]
  return `${count(elements.length, 'item', 'items')}${list ? `: ${list}` : ''}.`
}

/** @param {Request} request */
export async function handle(request) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id') ?? ''
  const site = escape(`${url.protocol}//${request.headers.get('x-forwarded-host') ?? url.host}`)
  const valid = ID_RE.test(id)

  // unknown boards get the general card, so a made-up link reveals nothing
  let title = 'Canvas — a calm whiteboard'
  let description = 'Sketch, plan and make moodboards on a calm, minimal whiteboard. No sign-up.'
  // a picture of the board itself once someone has shared it, else the general Canvas card
  let image = '/og.png'
  if (valid && redisConfig()) {
    try {
      const raw = /** @type {string | null} */ (await redis(['GET', `board:${id}`]))
      const board = raw ? JSON.parse(raw) : null
      if (board) {
        const name = typeof board.title === 'string' ? board.title.trim().slice(0, 120) : ''
        title = name && name !== 'Untitled' ? `${name} — Canvas` : 'A board on Canvas'
        const elements = Array.isArray(board.elements) ? board.elements : []
        if (typeof board.preview === 'number') image = `/api/preview?id=${id}&v=${board.preview}`
        description = `${describe(elements)} Open it in your browser — no sign-up needed.`
      }
    } catch (err) {
      console.error(err)
    }
  }

  const target = valid ? `/#${id}` : '/'
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canvas" />
<meta property="og:title" content="${escape(title)}" />
<meta property="og:description" content="${escape(description)}" />
<meta property="og:url" content="${site}/b/${valid ? id : ''}" />
<meta property="og:image" content="${site}${escape(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="theme-color" content="#fbfbfb" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<script>
  // on to the board; an edit key in the #fragment comes along (it never reaches the server)
  var key = location.hash.length > 1 ? '.' + location.hash.slice(1) : ''
  location.replace(${JSON.stringify(target)} + (${valid ? 'true' : 'false'} ? key : ''))
</script>
</head>
<body style="font-family: system-ui, sans-serif; background: #fbfbfb">
<p style="margin: 40vh auto; text-align: center"><a href="${target}">Open the board on Canvas</a></p>
</body>
</html>
`
  return new Response(page, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // previews may be a few minutes behind a rename; saves a database read per click
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  })
}

export default { fetch: handle }
