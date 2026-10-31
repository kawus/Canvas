// Help centre search: a small index of every question, searched as you type.
;(() => {
  const box = document.querySelector('.search')
  if (!box) return
  const input = box.querySelector('input')
  const list = box.querySelector('.results')
  const root = box.dataset.root || ''
  let index = null
  let active = -1

  const load = () =>
    (index ??= fetch(`${root}search.json`)
      .then((r) => r.json())
      .catch(() => []))

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const words = (q) => q.toLowerCase().split(/\s+/).filter(Boolean)
  const mark = (text, ws) => {
    let out = esc(text)
    for (const w of ws) out = out.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>')
    return out
  }
  // show the part of the answer around the first match
  const snippet = (text, ws) => {
    const lower = text.toLowerCase()
    const at = Math.min(...ws.map((w) => lower.indexOf(w)).filter((i) => i >= 0), Infinity)
    if (!Number.isFinite(at) || at < 60) return text.slice(0, 160)
    return `…${text.slice(at - 40, at + 120)}`
  }

  function score(item, ws) {
    const h = item.h.toLowerCase()
    const x = item.x.toLowerCase()
    const t = item.t.toLowerCase()
    let s = 0
    for (const w of ws) {
      const inH = h.includes(w)
      const inX = x.includes(w)
      const inT = t.includes(w)
      if (!inH && !inX && !inT) return 0
      s += (inH ? 4 : 0) + (inT ? 1 : 0) + (inX ? 1 : 0) + (h.split(/\W+/).includes(w) ? 2 : 0)
    }
    return s
  }

  async function update() {
    const q = input.value.trim()
    if (!q) {
      list.hidden = true
      return
    }
    const ws = words(q)
    const items = (await load())
      .map((item) => ({ item, s: score(item, ws) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
    if (input.value.trim() !== q) return
    active = items.length ? 0 : -1
    list.innerHTML = items.length
      ? items
          .map(
            ({ item }, i) => `<a class="result${i === 0 ? ' is-active' : ''}" role="option" href="${root}${item.u}">
              <span class="result-head">${mark(item.h, ws)}</span>
              ${item.h !== item.t ? `<span class="result-topic">${esc(item.t)}</span>` : ''}
              <span class="result-text">${mark(snippet(item.x, ws), ws)}</span>
            </a>`,
          )
          .join('')
      : `<div class="results-empty">No answers for “${esc(q)}”. Try another word, or browse the topics.</div>`
    list.hidden = false
  }

  function move(d) {
    const links = [...list.querySelectorAll('.result')]
    if (!links.length) return
    links[active]?.classList.remove('is-active')
    active = (active + d + links.length) % links.length
    links[active].classList.add('is-active')
    links[active].scrollIntoView({ block: 'nearest' })
  }

  input.addEventListener('focus', () => {
    void load()
    if (input.value.trim()) list.hidden = false
  })
  input.addEventListener('input', () => void update())
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      move(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(-1)
    } else if (e.key === 'Enter') {
      const link = list.querySelectorAll('.result')[active]
      if (link) location.href = link.href
    } else if (e.key === 'Escape') {
      input.value = ''
      list.hidden = true
      input.blur()
    }
  })
  document.addEventListener('pointerdown', (e) => {
    if (!box.contains(e.target)) list.hidden = true
  })
  // "/" jumps to search, like in many docs sites
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== input && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      input.focus()
    }
  })

  // the Pro price, as it is right now (or that it's free during early access)
  const price = document.querySelector('[data-pro-price]')
  if (price)
    fetch(`${root}../api/pro?action=config`)
      .then((r) => r.json())
      .then((c) => {
        const fmt = (n) =>
          new Intl.NumberFormat(undefined, { style: 'currency', currency: c.currency.toUpperCase(), minimumFractionDigits: n % 100 ? 2 : 0 }).format(n / 100)
        if (c.mode === 'smoke') price.textContent = 'Canvas Pro is free while it’s in early access. Choose a plan in Canvas and live editing unlocks right away — nothing to pay.'
        else if (c.mode === 'live') price.textContent = `${fmt(c.month)} a month, or ${fmt(c.year)} a year (save ${Math.round((1 - c.year / (c.month * 12)) * 100)}%). Prices may include tax depending on where you live.`
        else if (c.mode === 'off') price.textContent = 'Right now everything in Canvas is free, including editing together.'
      })
      .catch(() => {})

  // highlight the question you're reading in "On this page"
  const toc = document.querySelectorAll('.toc a')
  if (toc.length && 'IntersectionObserver' in window) {
    const byId = new Map([...toc].map((a) => [a.getAttribute('href').slice(1), a]))
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            toc.forEach((a) => a.classList.remove('is-active'))
            byId.get(e.target.id)?.classList.add('is-active')
          }
      },
      { rootMargin: '-70px 0px -70% 0px' },
    )
    document.querySelectorAll('.article h2[id]').forEach((h) => io.observe(h))
  }
})()
