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

  it('shows day-of-month and MAPE value in each cell', () => {
    render(<AccuracyStrip hourly={hourly} dates={days} onPickDay={() => {}} selectedDate="2026-01-02" />)
    const cell = screen.getByTitle('2026-01-27 · MAPE 23.0%')
    expect(cell).toHaveTextContent('27')
    expect(cell).toHaveTextContent('23.0')
    expect(screen.getByTitle('2026-01-31 · MAPE 25.0%').style.color).toBe('rgb(255, 255, 255)')
    expect(screen.getByTitle('2026-01-01 · MAPE 10.0%').style.color).toBe('rgb(15, 23, 42)')
  })

  it('labels the panel and explains MAPE', () => {
    render(<AccuracyStrip hourly={hourly} dates={days} onPickDay={() => {}} selectedDate="2026-01-02" />)
    expect(screen.getByText(/DAILY FORECAST ERROR · MAPE \(%\)/)).toBeInTheDocument()
    expect(screen.getByText(/mean absolute percentage error/i)).toBeInTheDocument()
  })

  it('renders gap markers for hours without error', () => {
    const hourlyWithGap: HourPoint[] = [
      { t: '2026-01-02T00:00:00Z', forecast: null, actual: 3000, err: null, abs_err: null, pct_err: null },
    ]
    render(
      <AccuracyStrip
        hourly={hourlyWithGap}
        dates={[{ date: '2026-01-02', mape: null }]}
        onPickDay={() => {}}
        selectedDate="2026-01-02"
      />,
    )
    expect(screen.getByTitle('00:00 · no forecast')).toHaveAttribute('class', 'err-gap')
  })

  it('renders unknown-mape day cells with the gap background', () => {
    render(
      <AccuracyStrip
        hourly={[]}
        dates={[{ date: '2026-01-02', mape: null }]}
        onPickDay={() => {}}
        selectedDate="2026-01-02"
      />,
    )
    expect(screen.getByTitle('2026-01-02 · MAPE —%').style.background).toContain('rgb(238, 242, 247)')
  })
})
