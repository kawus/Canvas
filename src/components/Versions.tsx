import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { byDay, byOther, dayLabel, loadHistory, loadVersion, restore, timeLabel, whenLabel, type History, type Version } from '../versions'

/**
 * Earlier versions: a list of the board's saved versions (side panel, or a
 * sheet on phones) and a bar to go back to now or restore the one on show.
 * The board can't be edited while it's open.
 */
export function Versions() {
  const open = useStore((s) => s.versionsOpen)
  const id = useStore((s) => s.doc.id)
  if (!open) return null
  return <VersionsOpen key={id} />
}

function VersionsOpen() {
  const doc = useStore((s) => s.doc)
  const earlier = useStore((s) => s.earlier)
  const [history, setHistory] = useState<History | null | 'error'>(null)
  const [picked, setPicked] = useState<Version | null>(null)
  const [loading, setLoading] = useState<number | null>(null)
  const close = () => useStore.getState().setVersionsOpen(false)

  useEffect(() => {
    let alive = true
    if (doc.key) void loadHistory(doc.id, doc.key).then((h) => alive && setHistory(h ?? 'error'))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc goes back to now, then closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (useStore.getState().earlier) useStore.getState().setEarlier(null)
      else close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const show = async (v: Version) => {
    if (!doc.key) return
    setLoading(v.at)
    const elements = await loadVersion(doc.id, doc.key, v.at)
    setLoading(null)
    if (!elements) {
      useStore.getState().showToast('Couldn’t open that version. Please try again.')
      return
    }
    setPicked(v)
    useStore.getState().setEarlier({ at: v.at, elements })
  }
  const backToNow = () => {
    setPicked(null)
    useStore.getState().setEarlier(null)
  }

  const now = history && history !== 'error' ? history.now : null
  const who = (v: Version) => byOther(v)
  const showing = earlier && picked ? picked : null

  return (
    <>
      {showing && earlier && (
        <div className="versions-bar panel" data-testid="versions-bar">
          <span className="versions-when">
            <span className="versions-long">
              <em>Viewing</em> <b>{whenLabel(showing.at)}</b>
            </span>
            <b className="versions-short">
              {dayLabel(showing.at)}, {timeLabel(showing.at)}
            </b>
          </span>
          <button type="button" className="ghost-btn versions-now" onClick={backToNow}>
            <span className="versions-long">Back to now</span>
            <span className="versions-short">Now</span>
          </button>
          <button type="button" className="primary-btn" onClick={() => restore(showing, earlier.elements)} data-testid="versions-restore">
            <span className="versions-long">Restore this version</span>
            <span className="versions-short">Restore</span>
          </button>
        </div>
      )}
      <aside className="versions-panel panel" aria-label="Earlier versions" data-testid="versions">
        <div className="versions-grab" aria-hidden />
        <div className="versions-head">
          <h2>Earlier versions</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close" data-testid="versions-close">
            <X />
          </button>
        </div>
        <p className="versions-sub">A version is kept for every hour you work on the board, for 30 days. Looking doesn’t change anything.</p>
        <div className="versions-list">
          {history === null && <p className="versions-note">Loading…</p>}
          {history === 'error' && <p className="versions-note">Couldn’t load earlier versions. Check your connection and try again.</p>}
          {now && history && history !== 'error' && (
            <>
              <div className="versions-day">{dayLabel(now.at)}</div>
              <button type="button" className={`versions-row ${!earlier ? 'is-on' : ''}`} onClick={backToNow} data-testid="versions-now">
                <b>Now</b>
                <span>
                  {timeLabel(now.at)}
                  {who(now) ? ` · ${who(now)}` : ''}
                </span>
              </button>
              {byDay(history.versions).map((g, gi) => (
                <div key={g.day}>
                  {(gi > 0 || g.day !== dayLabel(now.at)) && <div className="versions-day">{g.day}</div>}
                  {g.versions.map((v) => (
                    <button
                      type="button"
                      key={v.at}
                      className={`versions-row ${earlier?.at === v.at ? 'is-on' : ''} ${loading === v.at ? 'is-loading' : ''}`}
                      onClick={() => void show(v)}
                      data-testid="versions-row"
                    >
                      <b>{timeLabel(v.at)}</b>
                      {who(v) && <span>{who(v)}</span>}
                    </button>
                  ))}
                </div>
              ))}
              {!history.versions.length && (
                <p className="versions-note">Earlier versions show up here once you’ve worked on the board for a while.</p>
              )}
              {history.created && <p className="versions-started">Started {dayLabel(history.created) === 'Today' ? 'today' : dayLabel(history.created) === 'Yesterday' ? 'yesterday' : dayLabel(history.created)}</p>}
            </>
          )}
        </div>
      </aside>
    </>
  )
}
