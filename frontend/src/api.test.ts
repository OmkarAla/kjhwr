import { describe, expect, it } from 'vitest'
import { apiUrl } from './api'

describe('apiUrl', () => {
  it('uses a same-origin path when no API base is configured', () => {
    expect(apiUrl('/api/health')).toBe('/api/health')
  })
})
