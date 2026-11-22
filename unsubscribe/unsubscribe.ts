/**
 * /unsubscribe/: take an email address off the updates list and the Ideas
 * board (api/updates.js). A link can fill the address in (?email=…), but it's
 * only removed when the button is pressed, so email scanners that open links
 * can't remove anyone by accident.
 */

const form = document.querySelector<HTMLFormElement>('#remove-form')
const field = form?.querySelector<HTMLInputElement>('input[name=email]')
const status = form?.querySelector<HTMLElement>('.idea-sent')
const button = form?.querySelector<HTMLButtonElement>('button')

const given = new URLSearchParams(location.search).get('email')
if (field && given) field.value = given.slice(0, 254)

form?.addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!field || !status || !button) return
  const email = field.value.trim()
  if (!email) return
  button.disabled = true
  status.textContent = 'Removing…'
  try {
    const r = await fetch('../api/updates?remove=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    const data = (await r.json().catch(() => null)) as { error?: string } | null
    if (r.ok) {
      status.textContent = 'Done. That address is no longer on any Canvas list.'
      field.value = ''
    } else status.textContent = r.status === 429 ? 'That’s a lot of tries for now. Please try again later.' : (data?.error ?? 'Couldn’t remove that. Please try again.')
  } catch {
    status.textContent = 'Couldn’t reach Canvas. Check your connection and try again.'
  } finally {
    button.disabled = false
  }
})
