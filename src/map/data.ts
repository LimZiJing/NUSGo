export async function fetchJson<T>(
  path: string,
  signal: AbortSignal,
  resourceName: string,
): Promise<T> {
  const basePath = import.meta.env.BASE_URL
  const relativePath = path.replace(/^\/+/, '')
  const response = await fetch(`${basePath}${relativePath}`, { signal })

  if (!response.ok) {
    throw new Error(`${resourceName} request failed: ${response.status}`)
  }

  return (await response.json()) as T
}
