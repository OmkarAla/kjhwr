import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useApi } from './useApi'

describe('useApi', () => {
  it('loads json data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hello: 'world' }),
    }))
    const { result } = renderHook(() => useApi<{ hello: string }>('/api/health'))
    await waitFor(() => expect(result.current.data).toEqual({ hello: 'world' }))
    expect(result.current.error).toBeNull()
  })

  it('exposes error state on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const { result } = renderHook(() => useApi('/api/day/9999'))
    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.data).toBeNull()
  })
})
