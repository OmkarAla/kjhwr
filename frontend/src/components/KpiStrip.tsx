import type { Metrics } from '../types'
import { fmtNum, fmtPercent } from '../lib/format'

type MetricKey = 'mae' | 'rmse' | 'mape' | 'bias'

const CARDS: { key: MetricKey; label: string; unit: string; sub: string }[] = [
  { key: 'mae', label: 'MAE', unit: 'MW', sub: 'mean |error|' },
  { key: 'rmse', label: 'RMSE', unit: 'MW', sub: 'root mean sq err' },
  { key: 'mape', label: 'MAPE', unit: '%', sub: 'mean |pct error|' },
  { key: 'bias', label: 'Bias', unit: 'MW', sub: 'forecast − actual' },
]

export function KpiStrip({ metrics }: { metrics: Metrics; title: string }) {
  return (
    <section aria-label="accuracy metrics" className="kpi-row">
      {CARDS.map((c) => (
        <div key={c.key} className={`kpi-card ${c.key === 'bias' && metrics.bias != null && metrics.bias > 0 ? 'kpi-over' : ''}`}>
          <div className="kpi-label">
            {c.label}
            {c.key === 'bias' && metrics.bias != null && metrics.bias > 0 && <span className="kpi-tag">over</span>}
          </div>
          <div className="kpi-value" data-testid={`kpi-${c.key}`}>
            {c.key === 'mape' ? fmtPercent(metrics.mape) : fmtNum(metrics[c.key])}
            {metrics[c.key] != null && <span className="kpi-unit"> {c.unit}</span>}
          </div>
          <div className="kpi-sub">{c.sub}</div>
        </div>
      ))}
    </section>
  )
}
