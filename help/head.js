/*
 * First thing on every help page (a file rather than inline code, so the
 * site's security policy can refuse all inline scripts):
 * - the address ends in a slash, since links inside are relative
 * - the theme chosen in Canvas applies before anything shows
 * - visit counts get the page only, not the #question or ?query
 */
if (!location.pathname.endsWith('/')) location.replace(location.pathname + '/' + location.search + location.hash)
try {
  var theme = localStorage.getItem('canvas-theme')
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
} catch (e) {
  /* ignore */
}
window.va =
  window.va ||
  function () {
    ;(window.vaq = window.vaq || []).push(arguments)
  }
window.va('beforeSend', function (e) {
  var u = new URL(e.url)
  u.hash = ''
  u.search = ''
  e.url = u.toString()
  return e
})
