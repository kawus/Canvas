/**
 * Videos and music that play on the board. A link card whose address belongs to
 * one of these services becomes playable; the player itself always comes from
 * the service, worked out here from the link (never stored with the board), so
 * a shared board can't point a player anywhere else. Nothing is loaded from the
 * service until someone presses play.
 */

export type MediaKind = 'video' | 'audio'
export interface Media {
  kind: MediaKind
  /** shown on the card */
  service: string
  /** the service's own player */
  embed: string
}

const ID = /^[\w-]{6,20}$/

function youtube(id: string | null | undefined, start: string | null, music: boolean): Media | null {
  if (!id || !ID.test(id)) return null
  const t = start ? parseInt(start.replace(/s$/, ''), 10) : 0
  // youtube-nocookie: YouTube's privacy-enhanced mode
  const embed = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0${t > 0 ? `&start=${t}` : ''}`
  return music ? { kind: 'audio', service: 'YouTube Music', embed } : { kind: 'video', service: 'YouTube', embed }
}

export function parseMedia(raw: string): Media | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '')
  const parts = u.pathname.split('/').filter(Boolean)

  // YouTube and YouTube Music
  if (host === 'youtu.be') return youtube(parts[0], u.searchParams.get('t'), false)
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const music = host === 'music.youtube.com'
    const start = u.searchParams.get('t') ?? u.searchParams.get('start')
    if (parts[0] === 'watch') return youtube(u.searchParams.get('v'), start, music)
    if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) return youtube(parts[1], start, music)
    return null
  }

  // Vimeo (vimeo.com/123, vimeo.com/123/abcdef for unlisted, player.vimeo.com/video/123)
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const nums = parts.filter((p) => /^\d{5,12}$/.test(p))
    if (!nums.length) return null
    const id = nums[0]
    const after = parts[parts.indexOf(id) + 1]
    const hash = u.searchParams.get('h') ?? (after && /^[0-9a-f]{6,20}$/.test(after) ? after : null)
    return { kind: 'video', service: 'Vimeo', embed: `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1${hash ? `&h=${hash}` : ''}` }
  }

  // Loom
  if (host === 'loom.com' && (parts[0] === 'share' || parts[0] === 'embed') && parts[1] && /^[0-9a-f]{16,40}$/.test(parts[1])) {
    return { kind: 'video', service: 'Loom', embed: `https://www.loom.com/embed/${parts[1]}?autoplay=1` }
  }

  // Spotify (open.spotify.com/track/…, also with a language part like /intl-de/)
  if (host === 'open.spotify.com') {
    const p = parts[0]?.startsWith('intl-') ? parts.slice(1) : parts
    const [type, id] = p
    if (!['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(type) || !id || !/^[A-Za-z0-9]{10,40}$/.test(id)) return null
    return { kind: 'audio', service: 'Spotify', embed: `https://open.spotify.com/embed/${type}/${id}` }
  }

  // Apple Music and Apple Podcasts: the same address on their embed hosts
  if (host === 'music.apple.com' || host === 'podcasts.apple.com') {
    if (parts.length < 2 || !/^[a-z]{2}$/.test(parts[0])) return null
    const path = parts.map(encodeURIComponent).join('/')
    const i = u.searchParams.get('i')
    const query = i && /^\d+$/.test(i) ? `?i=${i}` : ''
    return host === 'music.apple.com'
      ? { kind: 'audio', service: 'Apple Music', embed: `https://embed.music.apple.com/${path}${query}` }
      : { kind: 'audio', service: 'Apple Podcasts', embed: `https://embed.podcasts.apple.com/${path}${query}` }
  }

  // SoundCloud (soundcloud.com/artist/track or /artist/sets/playlist)
  if (host === 'soundcloud.com' && parts.length >= 2 && !['discover', 'search', 'you', 'upload', 'settings'].includes(parts[0])) {
    const clean = `https://soundcloud.com/${parts.slice(0, parts[1] === 'sets' ? 3 : 2).join('/')}`
    return {
      kind: 'audio',
      service: 'SoundCloud',
      embed: `https://w.soundcloud.com/player/?url=${encodeURIComponent(clean)}&auto_play=true&visual=true&hide_related=true&show_comments=false`,
    }
  }
  return null
}

/** The services that play on the board, with a colour each (shown in the Add a link dialog). */
export const SERVICES: { name: string; color: string }[] = [
  // YouTube Music links count as YouTube here (they're YouTube's player too)
  { name: 'YouTube', color: '#ff0033' },
  { name: 'Vimeo', color: '#1ab7ea' },
  { name: 'Loom', color: '#625df5' },
  { name: 'Spotify', color: '#1db954' },
  { name: 'Apple Music', color: '#fa243c' },
  { name: 'Apple Podcasts', color: '#9933cc' },
  { name: 'SoundCloud', color: '#ff5500' },
]

/** The player's address can only ever be one of these services. */
export const PLAYER_HOSTS = [
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'www.loom.com',
  'open.spotify.com',
  'embed.music.apple.com',
  'embed.podcasts.apple.com',
  'w.soundcloud.com',
]

const cache = new Map<string, Media | null>()
/** parseMedia, remembered (it runs on every render of every link card) */
export function mediaOf(url: string) {
  let m = cache.get(url)
  if (m === undefined) {
    m = parseMedia(url)
    if (m && !PLAYER_HOSTS.includes(new URL(m.embed).hostname)) m = null
    cache.set(url, m)
  }
  return m
}
