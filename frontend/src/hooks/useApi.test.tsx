import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useApi } from './useApi'

describe('useApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

  it('refetch re-issues the request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ n: 1 }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useApi<{ n: number }>('/api/health'))
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }))
    act(() => result.current.refetch())
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(2))
    expect(result.current.data).toEqual({ n: 1 })
  })

  it('fetches fresh data when path changes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ v: 'a' }) })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ v: 'b' }) })
    vi.stubGlobal('fetch', fetchMock)
    const { result, rerender } = renderHook(
      ({ path }: { path: string }) => useApi<{ v: string }>(path),
      { initialProps: { path: '/a' } },
    )
    await waitFor(() => expect(result.current.data).toEqual({ v: 'a' }))
    rerender({ path: '/b' })
    await waitFor(() => expect(result.current.data).toEqual({ v: 'b' }))
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})
