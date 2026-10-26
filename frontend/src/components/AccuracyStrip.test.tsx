import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AccuracyStrip } from './AccuracyStrip'
import type { HourPoint } from '../types'

const hourly: HourPoint[] = [
  { t: '2026-01-02T00:00:00Z', forecast: 3200, actual: 3000, err: 200, abs_err: 200, pct_err: 6.667 },
  { t: '2026-01-02T01:00:00Z', forecast: 3300, actual: 3500, err: -200, abs_err: 200, pct_err: 5.714 },
  { t: '2026-01-02T02:00:00Z', forecast: 3400, actual: 3600, err: -200, abs_err: 200, pct_err: 5.556 },
]

const days = Array.from({ length: 31 }, (_, i) => ({
  date: `2026-01-${String(i + 1).padStart(2, '0')}`,
  mae: 100 + i, rmse: 200 + i, mape: 10 + i * 0.5, bias: i % 3,
}))

describe('AccuracyStrip', () => {
  it('renders signed error bars with tooltips', () => {
    render(<AccuracyStrip hourly={hourly} dates={days} onPickDay={() => {}} selectedDate="2026-01-02" />)
    expect(screen.getByTitle('00:00 · forecast−actual: +200 MW (+6.7%)').className).toContain('err-over')
    expect(screen.getByTitle('01:00 · forecast−actual: -200 MW (-5.7%)').className).toContain('err-under')
  })

  it('renders 31 heatmap cells and fires day pick', () => {
    const onPick = vi.fn()
    render(<AccuracyStrip hourly={hourly} dates={days} onPickDay={onPick} selectedDate="2026-01-02" />)
    expect(screen.getAllByRole('button', { name: /MAPE/ }).length).toBe(31)
    fireEvent.click(screen.getByTitle('2026-01-27 · MAPE 23.0%'))
    expect(onPick).toHaveBeenCalledWith('2026-01-27')
  })
})
