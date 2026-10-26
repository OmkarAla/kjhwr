import { describe, expect, it } from 'vitest'
import { fmtDate, fmtNum, fmtTimeShort } from './format'

describe('format helpers', () => {
  it('pins documented outputs', () => {
    expect(fmtDate('2026-01-27')).toBe('Tue, 27 Jan 2026')
    expect(fmtTimeShort('2026-01-01T11:30:00Z')).toBe('11:30')
    expect(fmtTimeShort(null)).toBe('—')
    expect(fmtNum(24)).toBe('24.0')
    expect(fmtNum(null)).toBe('—')
  })
})
