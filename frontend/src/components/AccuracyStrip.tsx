import type { HourPoint } from '../types'

const hh = (t: string) => t.slice(11, 16)

const HEAT = ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#2563eb', '#1e3a8a']

function heatIndex(mape: number | null, max: number): number | null {
  if (mape == null) return null
  const f = Math.min(1, Math.max(0, mape) / Math.max(max, 1e-6))
  return Math.min(HEAT.length - 1, Math.floor(f * HEAT.length))
}

const heatColor = (idx: number | null): string => (idx == null ? '#eef2f7' : HEAT[idx])

const inkColor = (idx: number | null): string => {
  if (idx == null) return '#64748b'
  return idx >= 4 ? '#ffffff' : '#0f172a'
}

export interface DayAccuracyRow { date: string; mape: number | null }

export function AccuracyStrip({ hourly, dates, selectedDate, onPickDay }: {
  hourly: HourPoint[]
  dates: DayAccuracyRow[]
  selectedDate: string
  onPickDay: (d: string) => void
}) {
  const maxAbs = Math.max(1e-9, ...hourly.map((h) => h.abs_err ?? 0))
  const maxMape = Math.max(1e-9, ...dates.map((d) => d.mape ?? 0))

  return (
    <div className="acc-strip">
      <section className="panel" aria-label="signed error by hour">
        <h4>SIGNED ERROR BY HOUR · forecast−actual (MW)</h4>
        <div className="err-bars">
          {hourly.map((h) => {
            if (h.err == null) {
              return <div key={h.t} className="err-gap" title={`${hh(h.t)} · no forecast`} />
            }
            const over = h.err > 0
            const hpx = Math.max(2, Math.round((Math.abs(h.err) / maxAbs) * 56))
            const pct = h.pct_err == null ? null : `${h.err > 0 ? '+' : '-'}${Math.abs(h.pct_err).toFixed(1)}%`
            const sign = h.err > 0 ? '+' : '-'
            return (
              <div key={h.t}
                title={`${hh(h.t)} · forecast−actual: ${sign}${Math.abs(h.err).toFixed(0)} MW (${pct ?? '—'})`}
                className={over ? 'err-over' : 'err-under'}
                style={{ height: `${hpx}px`, width: '7px' }} />
            )
          })}
        </div>
        <div className="err-legend">over-forecast <span className="sw-over" /> · under-forecast <span className="sw-under" /></div>
      </section>

      <section className="panel" aria-label="day mape calendar">
        <h4>DAILY FORECAST ERROR · MAPE (%)</h4>
        <div className="heatmap">
          {dates.map((d) => {
            const idx = heatIndex(d.mape, maxMape)
            return (
              <button key={d.date}
                title={`${d.date} · MAPE ${d.mape == null ? '—' : d.mape.toFixed(1)}%`}
                aria-label={`Day ${d.date} MAPE ${d.mape == null ? 'unknown' : d.mape.toFixed(1)} percent`}
                className={`cell ${d.date === selectedDate ? 'cell-sel' : ''}`}
                style={{ background: heatColor(idx), color: inkColor(idx) }}
                onClick={() => onPickDay(d.date)}>
                <span className="cell-day">{Number(d.date.slice(8, 10))}</span>
                <span className="cell-mape">{d.mape == null ? '—' : d.mape.toFixed(1)}</span>
              </button>
            )
          })}
        </div>
        <div className="heat-note">each square = one delivery day · MAPE = mean absolute percentage error · click to open</div>
      </section>
    </div>
  )
}
