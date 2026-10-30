const BASE: string = import.meta.env.VITE_API_BASE ?? ""

export const apiUrl = (path: string): string => `${BASE}${path}`

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(apiUrl(path), { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  return res.json() as Promise<T>
}
