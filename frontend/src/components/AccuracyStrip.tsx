import type { HourPoint } from '../types'

const hh = (t: string) => t.slice(11, 16)

const HEAT = ['#06283e', '#0c4a6e', '#0e7490', '#0891b2', '#22d3ee', '#67e8f9']

function heatColor(mape: number | null, max: number): string {
  if (mape == null) return '#141d33'
  const f = Math.min(1, Math.max(0, mape) / Math.max(max, 1e-6))
  return HEAT[Math.min(HEAT.length - 1, Math.floor(f * HEAT.length))]
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
        <h4>JANUARY DAY-MAPE CALENDAR</h4>
        <div className="heatmap">
          {dates.map((d) => (
            <button key={d.date}
              title={`${d.date} · MAPE ${d.mape == null ? '—' : d.mape.toFixed(1)}%`}
              aria-label={`Day ${d.date} MAPE ${d.mape == null ? 'unknown' : d.mape.toFixed(1)} percent`}
              className={`cell ${d.date === selectedDate ? 'cell-sel' : ''}`}
              style={{ background: heatColor(d.mape, maxMape) }}
              onClick={() => onPickDay(d.date)} />
          ))}
        </div>
        <div className="heat-note">hover = exact MAPE · click = open day</div>
      </section>
    </div>
  )
}
