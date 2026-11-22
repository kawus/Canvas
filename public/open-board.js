/*
 * Board links (/b/<id>, api/share.js): on to the board. An edit key in the
 * link's #fragment comes along; it never reaches the server. A file rather
 * than inline code, so the site's security policy can refuse inline scripts.
 */
;(function () {
  var me = document.currentScript
  var target = me && me.getAttribute('data-target')
  if (!target || target.charAt(0) !== '/') return
  var key = me.getAttribute('data-board') === '1' && location.hash.length > 1 ? '.' + location.hash.slice(1) : ''
  location.replace(target + key)
})()
