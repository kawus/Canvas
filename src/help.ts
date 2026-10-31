/** The help centre lives at /help/, next to the app (built from help/*.md). */
export function helpUrl(path = '') {
  return new URL(`help/${path}`, location.href).href
}

export function openHelp(path = '') {
  window.open(helpUrl(path), '_blank', 'noopener')
}
