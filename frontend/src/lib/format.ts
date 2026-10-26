export const fmtNum = (v: number | null | undefined, digits = 1): string =>
  v == null ? '—' : v.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits })

export const fmtPercent = (v: number | null | undefined): string =>
  v == null ? '—' : fmtNum(v, 2)

export const fmtTimeShort = (iso: string | null): string =>
  iso == null ? '—' : iso.slice(11, 16)

export const fmtDate = (iso: string): string => {
  // "2026-01-27" → "Tue 27 Jan 2026" (UTC arithmetic only — January GMT, no DST)
  return new Date(iso + 'T00:00:00Z').toLocaleString('en-GB', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}
