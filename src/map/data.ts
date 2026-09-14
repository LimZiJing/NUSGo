export async function fetchJson<T>(
  path: string,
  signal: AbortSignal,
  resourceName: string,
): Promise<T> {
  const response = await fetch(path, { signal })

  if (!response.ok) {
    throw new Error(`${resourceName} request failed: ${response.status}`)
  }

  return (await response.json()) as T
}
