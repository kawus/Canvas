import { ArrowLeft } from 'lucide-react'
import { useState, useEffect } from 'react'

type Counts = { total: number; people: number; last7: number }
type Day = { day: string; checks: number; changed: number; devices: number | null }
type Stats = { mode: string; events: Record<'locked' | 'view' | 'intent_month' | 'intent_year', Counts>; usage?: Day[] }

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
      {stats?.usage && <UsageCard days={stats.usage} />}
    </div>
  )
}

const fmt = (n: number) => Math.round(n).toLocaleString()
const sum = (days: Day[], k: 'checks' | 'changed') => days.reduce((t, d) => t + d[k], 0)
const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' })

/** Board sync: how often open boards ask the database "anything new?" */
function UsageCard({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const today = days[days.length - 1]
  const week = days.slice(-7)
  const recent = days.slice(-14)
  const last7 = sum(week, 'checks')
  const last30 = sum(days, 'checks')
  const changed30 = sum(days, 'changed')
  const perMonth = (last7 / 7) * 30
  const max = Math.max(1, ...recent.map((d) => d.checks))
  const tip = (d: Day) =>
    `${dayLabel(d.day, { weekday: 'short', day: 'numeric', month: 'short' })}: ${fmt(d.checks)} checks, ${fmt(d.changed)} downloads${d.devices ? `, ${d.devices} device${d.devices === 1 ? '' : 's'}` : ''}`

  return (
    <div className="stats-card panel" data-testid="usage">
      <h2 className="stats-title">Board sync</h2>
      <p className="stats-sub">
        While a board is open, each device asks the database “anything new?” — every 10 seconds while it's being worked on,
        easing off to once a minute when it's quiet — so your own devices stay in step. This isn’t live collaboration — that’s Edit together. Each check is one small database read; compare
        the monthly figure with your Upstash plan’s request limit.
      </p>
      <div className="usage-kpis">
        <div>
          <div className="stats-big" data-testid="usage-today">{fmt(today.checks)}</div>
          <div className="stats-label">checks today</div>
        </div>
        <div>
          <div className="stats-big">{fmt(last7)}</div>
          <div className="stats-label">last 7 days</div>
        </div>
        <div>
          <div className="stats-big">{fmt(last30)}</div>
          <div className="stats-label">last 30 days</div>
        </div>
        <div>
          <div className="stats-big" data-testid="usage-month">{fmt(perMonth)}</div>
          <div className="stats-label">per month, at this week’s pace</div>
        </div>
      </div>

      <div className="usage-chart" aria-label="Checks per day, last 14 days">
        {recent.map((d, i) => (
          <div
            key={d.day}
            className="usage-slot"
            tabIndex={0}
            aria-label={tip(d)}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            {i === recent.length - 1 && d.checks > 0 && (
              <span className="usage-value" style={{ bottom: `calc(${(d.checks / max) * 100}% + 4px)` }}>
                {fmt(d.checks)}
              </span>
            )}
            <span className="usage-bar" style={{ height: `${(d.checks / max) * 100}%` }} />
            {hover === i && <span className={`usage-tip ${i > recent.length - 4 ? 'is-left' : ''}`}>{tip(d)}</span>}
          </div>
        ))}
      </div>
      <div className="usage-axis">
        <span>{dayLabel(recent[0].day, { day: 'numeric', month: 'short' })}</span>
        <span>Today</span>
      </div>

      <p className="stats-foot">
        {last30 ? `${Math.round((changed30 / last30) * 100)}% of checks found changes and downloaded the board. ` : ''}
        {today.devices ? `${today.devices} device${today.devices === 1 ? '' : 's'} had a board open today. ` : ''}
        Reported every few minutes, so today’s number lags a little.
      </p>
      <details className="usage-table">
        <summary>Show as table</summary>
        <table className="stats-table">
          <thead>
            <tr>
              <th />
              <th>Checks</th>
              <th>Downloads</th>
              <th>Devices</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.day}>
                <td>{dayLabel(d.day, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                <td>{fmt(d.checks)}</td>
                <td>{fmt(d.changed)}</td>
                <td>{d.devices || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
