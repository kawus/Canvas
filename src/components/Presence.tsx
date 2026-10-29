import { toScreen } from '../handles'
import { useStore } from '../store'

/** Other people's cursors, with their name, in screen space. */
export function PeerCursors() {
  const peers = useStore((s) => s.collab.peers)
  const v = useStore((s) => s.viewport)
  return (
    <div className="peer-layer" aria-hidden>
      {peers.map((p) => {
        if (!p.cursor) return null
        const [x, y] = toScreen(v, p.cursor[0], p.cursor[1])
        return (
          <div key={p.id} className="peer-cursor" style={{ transform: `translate(${x}px, ${y}px)`, color: p.color }}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M2 1.5 L15.5 8.2 L9.2 9.6 L6.6 15.8 Z" fill="currentColor" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            <span className="peer-name" style={{ background: p.color }}>
              {p.name}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

/** Who else is on the board right now. */
export function PeerAvatars() {
  const peers = useStore((s) => s.collab.peers)
  const status = useStore((s) => s.collab.status)
  if (status === 'off' || !peers.length) return null
  const shown = peers.slice(0, 4)
  return (
    <div className="peer-avatars" data-testid="peer-avatars">
      {shown.map((p) => (
        <span key={p.id} className="peer-avatar tip-bottom" style={{ background: p.color }} aria-label={p.name}>
          {initials(p.name)}
          <span className="tip">{p.name}</span>
        </span>
      ))}
      {peers.length > shown.length && <span className="peer-avatar more">+{peers.length - shown.length}</span>}
    </div>
  )
}
