/** The help centre lives at /help/, next to the app (built from help/*.md). */
export function helpUrl(path = '') {
  return new URL(`help/${path}`, location.href).href
}

/** What's new: the changelog, with everything Canvas does at a glance. */
export const changelogUrl = () => new URL('changelog/', location.href).href

const SEEN = 'canvas-whatsnew-seen'
/** Whether there's a changelog entry this person hasn't seen (new visitors start up to date). */
export function hasNewChanges() {
  try {
    const seen = localStorage.getItem(SEEN)
    if (!seen) {
      localStorage.setItem(SEEN, __LATEST_CHANGE__)
      return false
    }
    return seen < __LATEST_CHANGE__
  } catch {
    return false
  }
}
export function markChangesSeen() {
  try {
    localStorage.setItem(SEEN, __LATEST_CHANGE__)
  } catch {
    /* ignore */
  }
}

export function openHelp(path = '') {
  window.open(helpUrl(path), '_blank', 'noopener')
}
