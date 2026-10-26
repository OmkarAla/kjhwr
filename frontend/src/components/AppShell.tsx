import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApi } from '../hooks/useApi'
import type { DayResponse, DayRow, MonthResponse } from '../types'
import { ControlRail } from './ControlRail'
import { MainChart } from './MainChart'
import { KpiStrip } from './KpiStrip'
import { AccuracyStrip } from './AccuracyStrip'
import { ErrorBanner, GapChip, Skeleton } from './States'

function parseState(): { date: string | null; rev: string | null; overlayRev: string | null } {
  const p = new URLSearchParams(window.location.search)
  return { date: p.get('date'), rev: p.get('rev'), overlayRev: p.get('rev2') }
}

export function AppShell() {
  const init = useMemo(() => parseState(), [])
  const [date, setDate] = useState<string | null>(init.date)
  const [rev, setRev] = useState<string | null>(init.rev)
  const [overlayRev, setOverlayRev] = useState<string | null>(init.overlayRev)

  const calendar = useApi<{ days: DayRow[] }>('/api/calendar')
  const month = useApi<MonthResponse>('/api/month')

  const dates = calendar.data?.days ?? []
  const activeDate = date && dates.some((d) => d.date === date) ? date : dates[0]?.date ?? null

  const dayPath = useMemo(
    () => (activeDate ? `/api/day/${activeDate}${rev ? `?revision=${rev}` : ''}` : null),
    [activeDate, rev])
  const day = useApi<DayResponse>(dayPath)

  useEffect(() => {
    const p = new URLSearchParams()
    if (activeDate) p.set('date', activeDate)
    if (rev) p.set('rev', rev)
    if (overlayRev) p.set('rev2', overlayRev)
    window.history.replaceState(null, '', `?${p.toString()}`)
  }, [activeDate, rev, overlayRev])

  const onPickDay = useCallback((d: string) => { setDate(d); setRev(null); setOverlayRev(null) }, [])
  const selectedRev = rev ?? day.data?.decision_publish_time ?? null

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">GB WIND · DAY-AHEAD PORTAL</span>
        <span className="brand-sub">delivery-day wind & forecast accuracy · Elexon BMRS · Jan 2026</span>
      </header>

      {calendar.error && <ErrorBanner message={`calendar: ${calendar.error}`} onRetry={calendar.refetch} />}

      <div className="shell-body">
        {day.data && activeDate && (
          <ControlRail
            dates={dates}
            date={activeDate}
            onChangeDate={onPickDay}
            day={day.data}
            month={month.data}
            rev={rev}
            overlayRev={overlayRev}
            onSelectRev={setRev}
            onSelectOverlay={setOverlayRev} />
        )}
        <main>
          {day.error && <ErrorBanner message={`day: ${day.error}`} onRetry={day.refetch} />}
          {(day.loading || !day.data) && !day.error && <Skeleton />}
          {day.data && !day.loading && day.data.gap_flag !== '' && <GapChip flag={day.data.gap_flag} />}
          {day.data && !day.loading && day.data.gap_flag !== 'no_decision_forecast' && (
            <>
              <h3 className="day-title">{activeDate}</h3>
              <KpiStrip metrics={day.data.metrics} title="DAY" />
              <MainChart day={day.data} selectedRev={selectedRev} overlayRev={overlayRev} />
              <AccuracyStrip
                hourly={day.data.hourly}
                dates={(month.data?.days ?? []).map((d) => ({ date: d.date, mape: d.mape }))}
                selectedDate={activeDate ?? ''}
                onPickDay={onPickDay} />
            </>
          )}
        </main>
      </div>
    </div>
  )
}
