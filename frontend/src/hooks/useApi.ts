import { useCallback, useEffect, useRef, useState } from 'react'
import { getJson } from '../api'

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(!!path)
  const [tick, setTick] = useState(0)
  const lastPath = useRef<string | null>(null)
  const refetch = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!path) return
    const pathChanged = lastPath.current !== path
    lastPath.current = path
    if (pathChanged) {
      setData(null)
      setError(null)
      setLoading(true)
    }
    const ctl = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      setError(null)
      getJson<T>(path, ctl.signal)
        .then(setData)
        .catch((e: unknown) => {
          if ((e as Error).name !== 'AbortError') setError(String((e as Error).message))
        })
        .finally(() => {
          if (!ctl.signal.aborted) setLoading(false)
        })
    }, 150)
    return () => { ctl.abort(); clearTimeout(timer) }
  }, [path, tick])

  return { data, error, loading, refetch }
}
