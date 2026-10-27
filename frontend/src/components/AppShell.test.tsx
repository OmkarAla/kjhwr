import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

const calendar = {
  days: ['2026-01-02', '2026-01-03'].map((date) => ({
    date, gap_flag: '', n_revisions: 2,
    decision_publish_time: '2026-01-01T11:30:00Z',
    mae: 200, rmse: 220, mape: 6.5, bias: 150,
    forecast_mean: 3200, actual_mean: 3050,
  })),
}

const dayPayload = (date: string) => ({
  date,
  gap_flag: '',
  decision_publish_time: '2026-01-01T11:30:00Z',
  requested_revision: null,
  overlay: null,
  metrics: { mae: 200, rmse: 220, mape: 6.5, bias: 150, n_hours: 24 },
  revisions: [
    { publishTime: '2026-01-01T11:30:00Z', points: [{ t: `${date}T00:00:00Z`, mw: 3200 }] },
    { publishTime: '2026-01-01T22:30:00Z', points: [{ t: `${date}T00:00:00Z`, mw: 3100 }] },
  ],
  actuals: [{ t: `${date}T00:00:00Z`, mw: 3000 }],
  hourly: [{ t: `${date}T00:00:00Z`, forecast: 3200, actual: 3000, err: 200, abs_err: 200, pct_err: 6.667 }],
})

const month = {
  month: '2026-01', mae: 210, rmse: 230, mape: 7.2, bias: 90, n_days: 2, n_hours: 48,
  days: calendar.days.map((d) => ({ date: d.date, mae: d.mae, rmse: d.rmse, mape: d.mape, bias: d.bias })),
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.includes('/api/calendar')) return Promise.resolve({ ok: true, json: () => Promise.resolve(calendar) })
    if (url.includes('/api/month')) return Promise.resolve({ ok: true, json: () => Promise.resolve(month) })
    const m = url.match(/api\/day\/(\d{4}-\d{2}-\d{2})/) as RegExpMatchArray
    return Promise.resolve({ ok: true, json: () => Promise.resolve(dayPayload(m[1])) })
  }))
})

describe('AppShell', () => {
  it('renders rail, kpis and heat cells', async () => {
    render(<AppShell />)
    await waitFor(() => expect(screen.getByText('DELIVERY DAY')).toBeInTheDocument())
    expect(screen.getByTestId('kpi-mae')).toHaveTextContent('200.0 MW')
    const list = screen.getByRole('listbox', { name: 'revisions' })
    expect(within(list).getAllByRole('option').length).toBe(3)
    expect(screen.getByText('D-1 · 1 Jan')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /MAPE/ }).length).toBe(2)
  })

  it('clicking a revision chip marks it selected', async () => {
    const user = userEvent.setup()
    render(<AppShell />)
    const list = await screen.findByRole('listbox', { name: 'revisions' })
    await user.click(within(list).getByRole('option', { name: '22:30' }))
    expect(screen.getByTestId('selected-rev')).toHaveTextContent('22:30 · D-1')
  })

  it('heatmap click switches delivery day', async () => {
    const user = userEvent.setup()
    render(<AppShell />)
    const cell = await screen.findByTitle('2026-01-03 · MAPE 6.5%')
    await user.click(cell)
    await waitFor(() => expect(screen.getByTestId('state-date')).toHaveValue('2026-01-03'))
    expect(window.location.search).toContain('date=2026-01-03')
  })

  it('recovers when a deep-linked revision is rejected', async () => {
    window.history.replaceState(null, '', '/?date=2026-01-02&rev=2026-01-01T22:30:00Z')
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('revision=')) return Promise.resolve({ ok: false, status: 422 })
      if (url.includes('/api/calendar')) return Promise.resolve({ ok: true, json: () => Promise.resolve(calendar) })
      if (url.includes('/api/month')) return Promise.resolve({ ok: true, json: () => Promise.resolve(month) })
      const m = url.match(/api\/day\/(\d{4}-\d{2}-\d{2})/) as RegExpMatchArray
      return Promise.resolve({ ok: true, json: () => Promise.resolve(dayPayload(m[1])) })
    }))
    render(<AppShell />)
    const railValue = await screen.findByTestId('selected-rev')
    expect(railValue).toHaveTextContent('D-1')
    expect(window.location.search).not.toContain('rev=')
  })
})
