import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KpiStrip } from './KpiStrip'

const metrics = { mae: 1089.4, rmse: 1492.2, mape: 14.667, bias: -411.0, n_hours: 24 }

describe('KpiStrip', () => {
  it('renders formatted values', () => {
    render(<KpiStrip metrics={metrics} title="DAY · Tue 02 Jan" />)
    expect(screen.getByText('MAE')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-mae')).toHaveTextContent('1,089.4 MW')
    expect(screen.getByTestId('kpi-rmse')).toHaveTextContent('1,492.2 MW')
    expect(screen.getByTestId('kpi-mape')).toHaveTextContent('14.67 %')
    expect(screen.getByTestId('kpi-bias')).toHaveTextContent('-411.0 MW')
  })

  it('renders dashes for missing metrics', () => {
    render(<KpiStrip metrics={{ mae: null, rmse: null, mape: null, bias: null, n_hours: 0 }} title="DAY · gap" />)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4)
  })
})
