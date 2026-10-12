export function parseApiOrigin(
  input: unknown,
  label = 'VITE_API_ORIGIN',
  options: { requireHttps?: boolean } = {},
): string {
  if (input === undefined || input === null || input === '') return ''
  if (typeof input !== 'string') throw new Error(`${label} must be an HTTP or HTTPS origin`)

  const value = input.trim()
  if (!value) return ''

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} must be an HTTP or HTTPS origin`)
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} must be an HTTP or HTTPS origin without credentials, path, query, or fragment`)
  }
  if (options.requireHttps && url.protocol !== 'https:') {
    throw new Error(`${label} must use HTTPS in production`)
  }

  return url.origin
}

export function parseCorsOrigins(input: unknown): readonly string[] {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error('API_CORS_ORIGINS must contain one or more exact origins')
  }

  const entries = input.split(',').map((origin) => origin.trim())
  if (entries.some((origin) => origin.length === 0)) {
    throw new Error('API_CORS_ORIGINS must not contain empty origins')
  }

  const origins = entries.map((origin) => parseApiOrigin(origin, 'API_CORS_ORIGINS entry'))
  if (new Set(origins).size !== origins.length) {
    throw new Error('API_CORS_ORIGINS must not contain duplicate origins')
  }

  return Object.freeze(origins)
}
