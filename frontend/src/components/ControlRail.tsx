import type { DayResponse, DayRow, MonthResponse } from '../types'
import { fmtDate, fmtNum, fmtPercent, fmtTimeShort } from '../lib/format'

export function ControlRail({ dates, date, onChangeDate, day, month, rev, overlayRev,
  onSelectRev, onSelectOverlay }: {
  dates: DayRow[]
  date: string
  onChangeDate: (d: string) => void
  day: DayResponse
  month: MonthResponse | null
  rev: string | null
  overlayRev: string | null
  onSelectRev: (r: string | null) => void
  onSelectOverlay: (r: string | null) => void
}) {
  const isAuto = rev == null || rev === day.decision_publish_time

  return (
    <aside className="rail">
      <label className="rail-label" htmlFor="day-picker">DELIVERY DAY</label>
      <select id="day-picker" data-testid="state-date" value={date}
        onChange={(e) => onChangeDate(e.target.value)}>
        {dates.map((d) => (
          <option key={d.date} value={d.date}>
            {d.date}{d.gap_flag ? ' · gap' : ''}
          </option>
        ))}
      </select>
      <div className="rail-date-long">{fmtDate(date)}</div>

      <div className="rail-label">DECISION REVISION</div>
      <div data-testid="selected-rev" className="rail-decision">
        {isAuto ? `${fmtTimeShort(day.decision_publish_time)} · D-1 ● auto` : fmtTimeShort(rev)}
      </div>
      <div className="chips" role="listbox" aria-label="revisions">
        {day.revisions.map((r) => {
          const isDecision = r.publishTime === day.decision_publish_time
          return (
            <button key={r.publishTime} type="button" role="option"
              aria-selected={r.publishTime === rev}
              className={`chip ${r.publishTime === rev ? 'chip-on' : ''} ${isDecision ? 'chip-decision' : ''}`}
              onClick={() => onSelectRev(r.publishTime)}>
              {fmtTimeShort(r.publishTime)}{isDecision ? ' ●' : ''}
            </button>
          )
        })}
        <button type="button" role="option" aria-selected={isAuto}
          className={`chip chip-auto ${isAuto ? 'chip-on' : ''}`}
          onClick={() => onSelectRev(null)}>
          auto
        </button>
      </div>

      <div className="rail-label">OVERLAY REVISION</div>
      <select aria-label="overlay revision" value={overlayRev ?? ''}
        onChange={(e) => onSelectOverlay(e.target.value || null)}>
        <option value="">none</option>
        {day.revisions
          .filter((r) => r.publishTime !== (rev ?? day.decision_publish_time))
          .map((r) => <option key={r.publishTime} value={r.publishTime}>{fmtTimeShort(r.publishTime)}</option>)}
      </select>

      <div className="rail-label">DAY KPIs</div>
      <div className="rail-grid">
        <div>MAE <b>{fmtNum(day.metrics.mae)}</b></div>
        <div>RMSE <b>{fmtNum(day.metrics.rmse)}</b></div>
        <div>MAPE <b>{fmtPercent(day.metrics.mape)}</b></div>
        <div>Bias <b>{fmtNum(day.metrics.bias)}</b></div>
      </div>

      {month && (
        <>
          <div className="rail-label">JANUARY KPIs</div>
          <div className="rail-grid">
            <div>MAE <b>{fmtNum(month.mae)}</b></div>
            <div>MAPE <b>{fmtPercent(month.mape)}</b></div>
          </div>
        </>
      )}

      <div className="rail-note">
        {day.gap_flag
          ? `gap: ${day.gap_flag}`
          : `${day.revisions.length} revisions · decision ${fmtTimeShort(day.decision_publish_time)}`}
      </div>
    </aside>
  )
}
