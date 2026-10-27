import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MainChart } from './MainChart'
import type { DayResponse } from '../types'

// jsdom does not implement ResizeObserver; recharts 3.10.1 mounts the chart
// body only after the size-detector effect reports a positive size.
class ResizeObserverStub implements ResizeObserver {
  private readonly callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }
  observe = (target: Element): void => {
    void target
    this.callback([{ contentRect: { width: 800, height: 300 } }] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver)
  }
  unobserve = (): void => {}
  disconnect = (): void => {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const day: DayResponse = {
  date: '2026-01-02',
  gap_flag: '',
  decision_publish_time: '2026-01-01T11:30:00Z',
  requested_revision: null,
  overlay: '2025-12-31T23:30:00Z',
  metrics: { mae: 200, rmse: 200, mape: 6.559, bias: 200, n_hours: 2 },
  revisions: [
    {
      publishTime: '2026-01-01T11:30:00Z',
      points: [
        { t: '2026-01-02T00:00:00Z', mw: 3200 },
        { t: '2026-01-02T01:00:00Z', mw: 3300 },
      ],
    },
    {
      publishTime: '2025-12-31T23:30:00Z',
      points: [
        { t: '2026-01-01T23:00:00Z', mw: 999 },
        { t: '2026-01-02T00:00:00Z', mw: 3100 },
      ],
    },
  ],
  actuals: [
    { t: '2026-01-02T00:00:00Z', mw: 3000 },
    { t: '2026-01-02T01:00:00Z', mw: null },
  ],
  hourly: [],
}

describe('MainChart', () => {
  it('renders overlay line only when an overlay revision is present', () => {
    const { rerender, container } = render(
      <MainChart day={day} selectedRev="2026-01-01T11:30:00Z" overlayRev="2025-12-31T23:30:00Z" />,
    )
    expect(screen.getByText('HOURLY WIND GENERATION · MW')).toBeInTheDocument()
    expect(screen.getByText('Overlay revision')).toBeInTheDocument()
    expect(container.querySelectorAll('.recharts-line')).toHaveLength(3)
    rerender(<MainChart day={day} selectedRev="2026-01-01T11:30:00Z" overlayRev={null} />)
    expect(screen.queryByText('Overlay revision')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.recharts-line')).toHaveLength(2)
    expect(screen.getByText('Decision forecast')).toBeInTheDocument()
  })

  it('labels a non-decision revision and reports its partial coverage', () => {
    render(<MainChart day={day} selectedRev="2025-12-31T23:30:00Z" overlayRev={null} />)
    expect(screen.getByText('Selected revision')).toBeInTheDocument()
    expect(screen.queryByText('Decision forecast')).not.toBeInTheDocument()
    expect(screen.getByText('1 of 2 h covered by this revision')).toBeInTheDocument()
  })

  it('shows full coverage without a note', () => {
    render(<MainChart day={day} selectedRev="2026-01-01T11:30:00Z" overlayRev={null} />)
    expect(screen.queryByText(/covered by this revision/)).not.toBeInTheDocument()
  })
})
