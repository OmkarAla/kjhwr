import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DayResponse } from '../types'

export function MainChart({ day, selectedRev, overlayRev }: {
  day: DayResponse
  selectedRev: string | null
  overlayRev: string | null
}) {
  const fc = day.revisions.find((r) => r.publishTime === selectedRev)
  const ov = day.revisions.find((r) => r.publishTime === overlayRev)

  const data = day.actuals
    .filter((a) => a.t.startsWith(day.date))
    .map((a) => ({
      t: a.t,
      actual: a.mw,
      forecast: fc?.points.find((p) => p.t === a.t)?.mw ?? null,
      overlay: ov?.points.find((p) => p.t === a.t)?.mw ?? null,
    }))

  const isDecision = !selectedRev || selectedRev === day.decision_publish_time
  const covered = data.filter((d) => d.forecast != null).length
  const partial = data.length > 0 && covered < data.length
  const note = partial
    ? `${covered} of ${data.length} h covered by this revision`
    : null

  return (
    <section className="panel panel-main" aria-label="wind generation chart">
      <div className="panel-head">
        <h4>HOURLY WIND GENERATION · MW</h4>
        {note && <span className="chart-note">{note}</span>}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="t" tickFormatter={(t: string) => t.slice(11, 16)} stroke="#64748b" fontSize={11} />
          <YAxis domain={[0, 'auto']} stroke="#64748b" fontSize={11} width={56} />
          <Tooltip
            formatter={(v, name) =>
              v == null ? ['—', name ?? ''] : [`${Math.round(Number(v)).toLocaleString('en-GB')} MW`, name ?? '']
            }
            contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', color: '#1e293b', boxShadow: '0 4px 12px rgba(15, 23, 42, .12)' }}
          />
          <Legend wrapperStyle={{ color: '#64748b', fontSize: 11 }} />
          <Line name="Actual" dataKey="actual" stroke="#d97706" strokeWidth={2} dot={false} />
          <Line name={isDecision ? 'Decision forecast' : 'Selected revision'} dataKey="forecast"
            stroke="#0284c7" strokeWidth={2.6} dot={covered <= 6 ? { r: 2.5, strokeWidth: 0 } : false} connectNulls />
          {ov && <Line name="Overlay revision" dataKey="overlay" stroke="#6366f1" strokeWidth={1.6} strokeDasharray="5 4" dot={false} connectNulls />}
        </LineChart>
      </ResponsiveContainer>
    </section>
  )
}
