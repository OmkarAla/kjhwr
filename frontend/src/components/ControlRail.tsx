import type { DayResponse, DayRow, MonthResponse } from '../types'
import { fmtDate, fmtNum, fmtPercent, fmtTimeShort } from '../lib/format'

const DAY_MS = 86_400_000

function leadLabel(publishDate: string, deliveryDate: string): string {
  const days = Math.round(
    (Date.parse(`${deliveryDate}T00:00:00Z`) - Date.parse(`${publishDate}T00:00:00Z`)) / DAY_MS,
  )
  return days === 0 ? 'D' : days > 0 ? `D-${days}` : `D+${-days}`
}

function fmtDayMonth(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleString('en-GB', {
    timeZone: 'UTC', day: 'numeric', month: 'short',
  })
}

function groupByPublishDate(revisions: DayResponse['revisions']) {
  return revisions.reduce<{ date: string; revs: DayResponse['revisions'] }[]>((groups, rev) => {
    const date = rev.publishTime.slice(0, 10)
    const group = groups.find((g) => g.date === date)
    if (group) group.revs.push(rev)
    else groups.push({ date, revs: [rev] })
    return groups
  }, [])
}

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
  const selected = day.revisions.find((r) => r.publishTime === rev)
  const selectedLead = selected ? leadLabel(selected.publishTime.slice(0, 10), day.date) : null

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
        {isAuto
          ? `${fmtTimeShort(day.decision_publish_time)} · D-1 ● auto`
          : `${fmtTimeShort(rev)}${selectedLead ? ` · ${selectedLead}` : ''}`}
      </div>
      <div className="rev-groups" role="listbox" aria-label="revisions">
        {groupByPublishDate(day.revisions).map((group) => (
          <div key={group.date} className="rev-group" role="group"
            aria-label={`${leadLabel(group.date, day.date)} ${fmtDayMonth(group.date)}`}>
            <div className="rev-group-label">
              {leadLabel(group.date, day.date)} · {fmtDayMonth(group.date)}
            </div>
            <div className="chips">
              {group.revs.map((r) => {
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
            </div>
          </div>
        ))}
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
