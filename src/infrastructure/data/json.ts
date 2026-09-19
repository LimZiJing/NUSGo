export async function fetchJson(
  path: string,
  signal: AbortSignal,
  resourceName: string,
): Promise<unknown> {
  const basePath = import.meta.env.BASE_URL
  const relativePath = path.replace(/^\/+/, '')
  const response = await fetch(`${basePath}${relativePath}`, { signal })

  if (!response.ok) {
    throw new Error(`${resourceName} request failed: ${response.status}`)
  }

  const payload: unknown = await response.json()
  return payload
}
