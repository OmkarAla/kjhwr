export interface Point { t: string; mw: number | null }
export interface HourPoint {
  t: string
  forecast: number | null
  actual: number | null
  err: number | null
  abs_err: number | null
  pct_err: number | null
}
export interface Metrics {
  mae: number | null
  rmse: number | null
  mape: number | null
  bias: number | null
  n_hours: number
}
export interface Revision { publishTime: string; points: Point[] }
export interface DayRow {
  date: string
  gap_flag: string
  decision_publish_time: string | null
  n_revisions: number
  mae: number | null
  rmse: number | null
  mape: number | null
  bias: number | null
  forecast_mean: number | null
  actual_mean: number | null
}
export interface DayResponse {
  date: string
  gap_flag: string
  decision_publish_time: string | null
  requested_revision: string | null
  overlay: string | null
  metrics: Metrics
  revisions: Revision[]
  actuals: Point[]
  hourly: HourPoint[]
}
export interface MonthResponse {
  month: string | null
  mae: number | null
  rmse: number | null
  mape: number | null
  bias: number | null
  n_days: number
  n_hours: number
  days: { date: string; mae: number | null; rmse: number | null; mape: number | null; bias: number | null }[]
}
