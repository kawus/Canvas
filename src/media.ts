/**
 * Videos and music that play on the board. A link card whose address belongs to
 * one of these services becomes playable; the player itself always comes from
 * the service, worked out here from the link (never stored with the board), so
 * a shared board can't point a player anywhere else. Video and music cards are
 * the service's own embedded player (Embeds.tsx), so they load from it when a
 * board shows them; nothing starts playing by itself.
 *
 * Bandcamp's player needs a number its links don't contain: Canvas reads it
 * from the page when the link is added and keeps only that number (`player`
 * on the card, e.g. "album=123"), checked here before it's used.
 */

import { parsePlace } from './places'

export type MediaKind = 'video' | 'audio' | 'map'
/** wide (videos), square (music), tall (TikTok, YouTube Shorts) */
export type MediaShape = 'wide' | 'square' | 'tall'
export interface Media {
  kind: MediaKind
  shape: MediaShape
  /** shown on the card */
  service: string
  /** the service's own player ('' while Bandcamp's number isn't known yet) */
  embed: string
  /** the player's own size (its native design), in pixels */
  size: [number, number]
}

const video = (service: string, embed: string, shape: MediaShape = 'wide'): Media => ({
  kind: 'video',
  shape,
  service,
  embed,
  size: shape === 'tall' ? [325, 578] : [512, 288],
})
const audio = (service: string, embed: string, size: [number, number] = [320, 352]): Media => ({ kind: 'audio', shape: 'square', service, embed, size })

const ID = /^[\w-]{6,20}$/

function youtube(id: string | null | undefined, start: string | null, music: boolean, short = false): Media | null {
  if (!id || !ID.test(id)) return null
  const t = start ? parseInt(start.replace(/s$/, ''), 10) : 0
  // youtube-nocookie: YouTube's privacy-enhanced mode
  const embed = `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0${t > 0 ? `&start=${t}` : ''}`
  return music ? audio('YouTube Music', embed, [512, 288]) : video('YouTube', embed, short ? 'tall' : 'wide')
}

export function parseMedia(raw: string, player?: string): Media | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '')
  const parts = u.pathname.split('/').filter(Boolean)

  // places: a live map on the card (Google's own map; OpenStreetMap for Apple Maps, which has none to embed)
  const spot = parsePlace(raw)
  if (spot && (spot.lat !== undefined || spot.name)) {
    const map = (service: string, embed: string): Media => ({ kind: 'map', shape: 'wide', service, embed, size: [420, 300] })
    if (spot.service === 'Google Maps') {
      const q = spot.name ? encodeURIComponent(spot.name) : `${spot.lat},${spot.lng}`
      const ll = spot.lat !== undefined ? `&ll=${spot.lat},${spot.lng}` : ''
      return map('Google Maps', `https://maps.google.com/maps?q=${q}${ll}&z=16&output=embed`)
    }
    if (spot.lat === undefined || spot.lng === undefined) return null
    const dx = 0.006
    const dy = 0.0035
    const bbox = [spot.lng - dx, spot.lat - dy, spot.lng + dx, spot.lat + dy].map((n) => n.toFixed(5)).join(',')
    return map('Apple Maps', `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${spot.lat},${spot.lng}`)
  }

  // YouTube and YouTube Music
  if (host === 'youtu.be') return youtube(parts[0], u.searchParams.get('t'), false)
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const music = host === 'music.youtube.com'
    const start = u.searchParams.get('t') ?? u.searchParams.get('start')
    if (parts[0] === 'watch') return youtube(u.searchParams.get('v'), start, music)
    if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) return youtube(parts[1], start, music, parts[0] === 'shorts')
    return null
  }

  // Vimeo (vimeo.com/123, vimeo.com/123/abcdef for unlisted, player.vimeo.com/video/123)
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const nums = parts.filter((p) => /^\d{5,12}$/.test(p))
    if (!nums.length) return null
    const id = nums[0]
    const after = parts[parts.indexOf(id) + 1]
    const hash = u.searchParams.get('h') ?? (after && /^[0-9a-f]{6,20}$/.test(after) ? after : null)
    return video('Vimeo', `https://player.vimeo.com/video/${id}?dnt=1${hash ? `&h=${hash}` : ''}`)
  }

  // Loom
  if (host === 'loom.com' && (parts[0] === 'share' || parts[0] === 'embed') && parts[1] && /^[0-9a-f]{16,40}$/.test(parts[1])) {
    return video('Loom', `https://www.loom.com/embed/${parts[1]}`)
  }

  // Spotify (open.spotify.com/track/…, also with a language part like /intl-de/)
  if (host === 'open.spotify.com') {
    const p = parts[0]?.startsWith('intl-') ? parts.slice(1) : parts
    const [type, id] = p
    if (!['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(type) || !id || !/^[A-Za-z0-9]{10,40}$/.test(id)) return null
    return audio('Spotify', `https://open.spotify.com/embed/${type}/${id}`)
  }

  // Apple Music and Apple Podcasts: the same address on their embed hosts
  if (host === 'music.apple.com' || host === 'podcasts.apple.com') {
    if (parts.length < 2 || !/^[a-z]{2}$/.test(parts[0])) return null
    const path = parts.map(encodeURIComponent).join('/')
    const i = u.searchParams.get('i')
    const query = i && /^\d+$/.test(i) ? `?i=${i}` : ''
    const single = !!query || parts[1] === 'song'
    return host === 'music.apple.com'
      ? audio('Apple Music', `https://embed.music.apple.com/${path}${query}`, [360, single ? 175 : 450])
      : audio('Apple Podcasts', `https://embed.podcasts.apple.com/${path}${query}`, [360, single ? 175 : 450])
  }

  // SoundCloud (soundcloud.com/artist/track or /artist/sets/playlist)
  if (host === 'soundcloud.com' && parts.length >= 2 && !['discover', 'search', 'you', 'upload', 'settings'].includes(parts[0])) {
    const clean = `https://soundcloud.com/${parts.slice(0, parts[1] === 'sets' ? 3 : 2).join('/')}`
    return audio('SoundCloud', `https://w.soundcloud.com/player/?url=${encodeURIComponent(clean)}&auto_play=false&visual=true&hide_related=true&show_comments=false`, [320, 320])
  }

  // TikTok (tiktok.com/@name/video/123…): a tall card
  if (host === 'tiktok.com') {
    const i = parts.indexOf('video')
    const id = i >= 0 ? parts[i + 1] : parts[0] === 'embed' ? parts[parts.length - 1] : null
    if (!id || !/^\d{10,25}$/.test(id)) return null
    return video('TikTok', `https://www.tiktok.com/player/v1/${id}?autoplay=0&rel=0&description=1&music_info=1`, 'tall')
  }

  // Bandcamp (artist.bandcamp.com/album/… or /track/…): the player needs the number read when the link was added
  if (host.endsWith('.bandcamp.com') && (parts[0] === 'album' || parts[0] === 'track') && parts[1]) {
    const ok = player && /^(album|track)=\d{1,15}$/.test(player)
    return audio('Bandcamp', ok ? `https://bandcamp.com/EmbeddedPlayer/${player}/size=large/bgcol=ffffff/linkcol=0687f5/tracklist=false/transparent=true/` : '', [350, 470])
  }

  // Deezer (deezer.com/track/123, also with a language part like /en/)
  if (host === 'deezer.com') {
    const p = /^[a-z]{2}$/.test(parts[0] ?? '') ? parts.slice(1) : parts
    const [type, id] = p
    if (!['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(type) || !id || !/^\d{1,15}$/.test(id)) return null
    return audio('Deezer', `https://widget.deezer.com/widget/auto/${type}/${id}`, [340, type === 'track' ? 300 : 400])
  }

  // Mixcloud (mixcloud.com/name/show/)
  if (host === 'mixcloud.com' && parts.length >= 2 && !['discover', 'upload', 'search', 'live', 'select'].includes(parts[0])) {
    const feed = `https://www.mixcloud.com/${parts.slice(0, 2).map(encodeURIComponent).join('/')}/`
    // Mixcloud's own player, as its oEmbed gives it: a slim strip
    return audio('Mixcloud', `https://www.mixcloud.com/widget/iframe/?feed=${encodeURIComponent(feed)}&hide_cover=1`, [440, 120])
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
  { name: 'TikTok', color: '#fe2c55' },
  { name: 'Bandcamp', color: '#1da0c3' },
  { name: 'Deezer', color: '#a238ff' },
  { name: 'Mixcloud', color: '#5000ff' },
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
  'www.tiktok.com',
  'bandcamp.com',
  'widget.deezer.com',
  'www.mixcloud.com',
  'maps.google.com',
  'www.openstreetmap.org',
]

const cache = new Map<string, Media | null>()
/** The card is the service's own player or map, live on the board (videos, music and places). */
export const isEmbed = (m: Media | null): m is Media => !!m

/** A card that plays: parseMedia, checked and remembered (it runs on every render of every link card). */
export function mediaOf(url: string, player?: string) {
  const key = player ? `${url} ${player}` : url
  let m = cache.get(key)
  if (m === undefined) {
    m = parseMedia(url, player)
    if (m && (!m.embed || !PLAYER_HOSTS.includes(new URL(m.embed).hostname))) m = null
    cache.set(key, m)
  }
  return m
}
