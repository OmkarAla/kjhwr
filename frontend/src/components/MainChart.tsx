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

  return (
    <section className="panel panel-main" aria-label="wind generation chart">
      <h4>HOURLY WIND GENERATION · MW</h4>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#22303e" strokeDasharray="3 3" />
          <XAxis dataKey="t" tickFormatter={(t: string) => t.slice(11, 16)} stroke="#8ea3c4" fontSize={11} />
          <YAxis domain={[0, 'auto']} stroke="#8ea3c4" fontSize={11} width={56} />
          <Tooltip
            formatter={(v, name) =>
              v == null ? ['—', name ?? ''] : [`${Math.round(Number(v)).toLocaleString('en-GB')} MW`, name ?? '']
            }
            contentStyle={{ background: '#101a30', border: '1px solid #223255', color: '#c8d3e8' }}
          />
          <Legend wrapperStyle={{ color: '#8ea3c4', fontSize: 11 }} />
          <Line name="Actual" dataKey="actual" stroke="#f59e0b" strokeWidth={2} dot={false} />
          <Line name="Decision forecast" dataKey="forecast" stroke="#22d3ee" strokeWidth={2.6} dot={false} connectNulls />
          {ov && <Line name="Overlay revision" dataKey="overlay" stroke="#a5b4fc" strokeWidth={1.6} strokeDasharray="5 4" dot={false} connectNulls />}
        </LineChart>
      </ResponsiveContainer>
    </section>
  )
}
