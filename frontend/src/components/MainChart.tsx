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
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={data} margin={{ top: 12, right: 20, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#ece7df" />
          <XAxis dataKey="t" tickFormatter={(t: string) => t.slice(11, 16)}
            axisLine={false} tickLine={false} tick={{ fill: '#8a817a', fontSize: 11 }} />
          <YAxis domain={['auto', 'auto']} tickFormatter={(v: number) => v.toLocaleString('en-GB')}
            axisLine={false} tickLine={false} tick={{ fill: '#8a817a', fontSize: 11 }} width={58} />
          <Tooltip
            cursor={{ stroke: '#d6d0c7' }}
            formatter={(v, name) =>
              v == null ? ['—', name ?? ''] : [`${Math.round(Number(v)).toLocaleString('en-GB')} MW`, name ?? '']
            }
            contentStyle={{ background: '#ffffff', border: '1px solid #e7e3dc', borderRadius: 10, color: '#1c1917', boxShadow: '0 10px 30px -12px rgba(28, 25, 23, .25)' }}
          />
          <Legend wrapperStyle={{ color: '#78716c', fontSize: 11, paddingTop: 10 }} iconType="line" />
          <Line name="Actual" dataKey="actual" stroke="#57534e" strokeWidth={1.8} dot={false} isAnimationActive={false} />
          <Line name={isDecision ? 'Decision forecast' : 'Selected revision'} dataKey="forecast"
            stroke="#0f766e" strokeWidth={2.4} dot={covered <= 6 ? { r: 2.5, strokeWidth: 0 } : false} connectNulls
            isAnimationActive={false} />
          {ov && <Line name="Overlay revision" dataKey="overlay" stroke="#7c6cd6" strokeWidth={1.6} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />}
        </LineChart>
      </ResponsiveContainer>
    </section>
  )
}
