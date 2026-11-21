/**
 * Ideas & requests on /changelog/: a small public roadmap. Everyone can vote
 * (one vote per device) and suggest ideas, which land in the Inbox column
 * straight away. The columns always read Inbox, Planned, Working on,
 * Delivered. The owner opens the page with ?admin, enters the key once, and
 * then moves ideas between columns, edits or removes them (see api/ideas.js).
 */

type Status = 'inbox' | 'planned' | 'working' | 'delivered'
interface Idea {
  id: string
  title: string
  text: string
  status: Status
  votes: number
  created: number
  /** only in the owner's view, when the person left one */
  email?: string
}

const API = new URL('../api/ideas', location.href).href
const COLUMNS: { status: Status; label: string; hint: string }[] = [
  { status: 'inbox', label: 'Inbox', hint: 'New ideas land here' },
  { status: 'planned', label: 'Planned', hint: 'Coming up' },
  { status: 'working', label: 'Working on', hint: 'Being built now' },
  { status: 'delivered', label: 'Delivered', hint: 'Ready to use' },
]

const root = document.getElementById('ideas-board')
const form = document.getElementById('idea-form') as HTMLFormElement | null

const store = {
  get(key: string) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* ignore */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

/** this browser's id, for one vote per device (the app's own id when Canvas has been opened here) */
function device() {
  try {
    const me = JSON.parse(store.get('canvas-me') || 'null')
    if (me?.id && /^[a-z0-9]{8,40}$/.test(me.id)) return me.id as string
  } catch {
    /* ignore */
  }
  let id = store.get('canvas-idea-device')
  if (!id) {
    id = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20)
    store.set('canvas-idea-device', id)
  }
  return id
}

const voted = new Set<string>(JSON.parse(store.get('canvas-idea-votes') || '[]'))
const saveVotes = () => store.set('canvas-idea-votes', JSON.stringify([...voted]))

/** tiny element helper */
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string; data?: Record<string, string> } = {}, ...kids: (Node | string | null | false)[]) {
  const el = document.createElement(tag)
  const { class: cls, data, ...rest } = props
  if (cls) el.className = cls
  if (data) for (const [k, v] of Object.entries(data)) el.dataset[k] = v
  Object.assign(el, rest)
  for (const k of kids) if (k) el.append(k)
  return el
}

let ideas: Idea[] = []
let adminKey = new URLSearchParams(location.search).has('admin') ? store.get('canvas-ideas-admin') : null
/** why the last key was refused, to say so plainly */
let refusal: string | null = null
const wantsAdmin = new URLSearchParams(location.search).has('admin')

async function api(method: string, body?: object, query = '') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (adminKey) headers['X-Admin-Key'] = adminKey
  const r = await fetch(API + query, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
  const ok = r.ok && (r.headers.get('content-type') || '').includes('json')
  return { ok, status: r.status, data: ok ? await r.json() : null }
}

async function load() {
  if (adminKey) {
    const r = await api('GET', undefined, '?admin=1')
    if (r.ok) {
      ideas = r.data.ideas
      return render()
    }
    // the key didn't work: forget it, remember why, and show the public board
    refusal = r.status === 403 ? ((await fetch(API + '?admin=1', { headers: { 'X-Admin-Key': adminKey } }).then((x) => x.json()).catch(() => null))?.reason ?? 'wrong-key') : 'offline'
    store.remove('canvas-ideas-admin')
    adminKey = null
  }
  const r = await api('GET')
  if (!r.ok) {
    root?.replaceChildren(h('p', { class: 'ideas-empty' }, 'Ideas will show up here soon.'))
    return
  }
  ideas = r.data.ideas
  render()
}

async function vote(idea: Idea, button: HTMLButtonElement) {
  const on = !voted.has(idea.id)
  if (on) voted.add(idea.id)
  else voted.delete(idea.id)
  saveVotes()
  idea.votes += on ? 1 : -1
  render()
  const r = await api('POST', { kind: 'vote', id: idea.id, device: device(), on })
  if (r.ok) {
    idea.votes = r.data.votes
    render()
  }
  void button
}

function card(idea: Idea) {
  const mine = voted.has(idea.id)
  const voteBtn = h('button', { type: 'button', class: `idea-vote ${mine ? 'is-on' : ''}`, title: mine ? 'Take back your vote' : 'I want this', ariaPressed: String(mine), ariaLabel: `${idea.votes} ${idea.votes === 1 ? 'vote' : 'votes'}. ${mine ? 'Take back your vote' : 'Vote for this'}` }, h('span', { class: 'idea-arrow', ariaHidden: 'true' }, '▲'), String(idea.votes))
  voteBtn.addEventListener('click', () => void vote(idea, voteBtn))
  const el = h(
    'article',
    { class: 'idea' },
    voteBtn,
    h(
      'div',
      { class: 'idea-body' },
      h('h4', {}, idea.title),
      idea.text ? h('p', {}, idea.text) : null,
      adminKey && idea.status === 'inbox' ? h('p', { class: 'idea-meta' }, new Date(idea.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), idea.email ? ` · ${idea.email}` : '') : null,
    ),
  )
  if (adminKey) el.append(adminControls(idea))
  return el
}

function adminControls(idea: Idea) {
  const select = h('select', { class: 'idea-status', ariaLabel: 'Status' }, ...COLUMNS.map((c) => h('option', { value: c.status, selected: c.status === idea.status }, c.label)))
  select.addEventListener('change', async () => {
    await api('PATCH', { id: idea.id, status: select.value })
    void load()
  })
  const remove = h('button', { type: 'button', class: 'idea-remove' }, 'Remove')
  remove.addEventListener('click', async () => {
    if (!confirm(`Remove “${idea.title}” from the board?`)) return
    await api('DELETE', undefined, `?id=${encodeURIComponent(idea.id)}`)
    void load()
  })
  return h('div', { class: 'idea-admin' }, select, remove)
}

function render() {
  if (!root) return
  const board = h(
    'div',
    { class: 'ideas-columns' },
    ...COLUMNS.map((c) => {
      const list = ideas.filter((i) => i.status === c.status)
      return h(
        'section',
        { class: `ideas-col is-${c.status}` },
        h('h3', {}, h('span', { class: 'idea-dot', ariaHidden: 'true' }), c.label, h('small', {}, String(list.length))),
        list.length ? h('div', { class: 'ideas-list' }, ...list.map(card)) : h('p', { class: 'ideas-empty' }, c.hint),
      )
    }),
  )
  root.replaceChildren(board)
}

/* ---------- the owner signs in once on this device ---------- */

function askForKey() {
  if (!root) return
  const field = h('input', { class: 'idea-field', type: 'password', placeholder: 'Admin key', autocomplete: 'current-password' })
  const go = h('button', { type: 'submit', class: 'btn btn-primary btn-small' }, 'Open')
  const note = h('p', { class: 'ideas-empty' }, 'The key you set as IDEAS_ADMIN_KEY in Vercel. It’s remembered on this device.')
  const f = h('form', { class: 'ideas-key' }, field, go)
  const box = h('div', { class: 'ideas-signin' }, f, note)
  f.addEventListener('submit', async (e) => {
    e.preventDefault()
    adminKey = field.value.trim()
    store.set('canvas-ideas-admin', adminKey)
    await load()
    // signed in: the box goes away; otherwise say why
    if (adminKey) box.remove()
    else
      note.textContent =
        refusal === 'missing'
          ? 'The admin key isn’t set up yet. Add IDEAS_ADMIN_KEY in Vercel (at least 12 characters), then redeploy.'
          : refusal === 'too-short'
            ? 'The key saved in Vercel is shorter than 12 characters. Make it longer, save, redeploy, then paste it here.'
            : refusal === 'offline'
              ? 'Couldn’t reach Canvas. Check your connection and try again.'
              : 'That key doesn’t match the one in Vercel. If you changed it just now, redeploy first.'
  })
  root.before(box)
}

/* ---------- suggesting ---------- */

form?.addEventListener('submit', async (e) => {
  e.preventDefault()
  const data = new FormData(form)
  const button = form.querySelector('button[type=submit]') as HTMLButtonElement
  const status = form.querySelector('.idea-sent') as HTMLElement
  button.disabled = true
  const r = await api('POST', { kind: 'suggest', title: data.get('title'), text: data.get('text'), email: data.get('email'), device: device() })
  button.disabled = false
  if (r.ok) {
    form.reset()
    // your own idea starts with your vote
    if (r.data?.id) {
      voted.add(r.data.id)
      saveVotes()
    }
    status.textContent = 'Thank you. Your idea is in the Inbox above.'
    void load()
  } else status.textContent = r.status === 429 ? 'That’s a lot of ideas for now. Try again later.' : (r.data?.error ?? 'Couldn’t send that. Please try again.')
})

if (wantsAdmin && !adminKey) askForKey()
void load()
