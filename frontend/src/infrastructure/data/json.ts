export function buildBasePathUrl(path: string): string {
  const relativePath = path.replace(/^\/+/, '')
  return `${import.meta.env.BASE_URL}${relativePath}`
}

export async function fetchJson(
  path: string,
  signal: AbortSignal,
  resourceName: string,
): Promise<unknown> {
  const response = await fetch(buildBasePathUrl(path), { signal })

  if (!response.ok) {
    throw new Error(`${resourceName} request failed: ${response.status}`)
  }

  const payload: unknown = await response.json()
  return payload
}
