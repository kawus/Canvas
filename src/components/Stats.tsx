import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'

type Counts = { total: number; people: number; last7: number }
type Stats = { mode: string; events: Record<'locked' | 'view' | 'intent_month' | 'intent_year', Counts> }

const ROWS: { key: keyof Stats['events']; label: string; hint: string }[] = [
  { key: 'locked', label: 'Hit the Pro feature', hint: 'Opened “Edit together” without Pro' },
  { key: 'view', label: 'Looked at the offer', hint: 'Opened the Canvas Pro window' },
  { key: 'intent_month', label: 'Chose monthly', hint: 'Clicked Continue on the monthly plan' },
  { key: 'intent_year', label: 'Chose yearly', hint: 'Clicked Continue on the yearly plan' },
]

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—')

/** Results of the Pro smoke test, at /#stats */
export function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('api/pro?action=stats', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error()
        setStats((await r.json()) as Stats)
      })
      .catch(() => setError('No numbers yet — the paywall or cloud saving isn’t set up.'))
  }, [])

  const e = stats?.events
  const buyers = e ? e.intent_month.people + e.intent_year.people : 0

  return (
    <div className="stats-page">
      <div className="stats-card panel">
        <a className="stats-back" href="#">
          <ArrowLeft /> Back to Canvas
        </a>
        <h1 className="stats-title">Canvas Pro — smoke test</h1>
        <p className="stats-sub">
          {stats?.mode === 'live'
            ? 'Real payments are on. These counts include the time before.'
            : 'The offer is shown, nobody is charged. Choosing a plan unlocks free early access.'}
        </p>
        {error && <p className="stats-sub">{error}</p>}
        {e && (
          <>
            <div className="stats-highlight">
              <div>
                <div className="stats-big" data-testid="stats-conversion">
                  {pct(buyers, e.view.people)}
                </div>
                <div className="stats-label">of people who saw the offer chose a plan</div>
              </div>
              <div>
                <div className="stats-big">{buyers}</div>
                <div className="stats-label">people would buy</div>
              </div>
            </div>
            <table className="stats-table">
              <thead>
                <tr>
                  <th />
                  <th>People</th>
                  <th>Times</th>
                  <th>Last 7 days</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <div className="stats-row-label">{r.label}</div>
                      <div className="stats-row-hint">{r.hint}</div>
                    </td>
                    <td data-testid={`stats-${r.key}`}>{e[r.key].people}</td>
                    <td>{e[r.key].total}</td>
                    <td>{e[r.key].last7}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="stats-foot">People are counted once per device, anonymously. Counts within a few percent.</p>
          </>
        )}
      </div>
    </div>
  )
}
