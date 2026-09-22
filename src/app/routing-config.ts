const DEVELOPMENT_VALHALLA_BASE_URL = '/valhalla'
const LOCAL_VALHALLA_BASE_URL = 'http://localhost:8002'

function isLocalValhallaBaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      (url.port === '' || url.port === '8002')
    )
  } catch {
    return false
  }
}

export function getValhallaBaseUrl(
  configuredBaseUrl: string | undefined,
  isDevelopment: boolean,
): string {
  const configured = configuredBaseUrl?.trim()
  if (isDevelopment && (!configured || isLocalValhallaBaseUrl(configured))) {
    return DEVELOPMENT_VALHALLA_BASE_URL
  }
  if (configured) return configured
  return isDevelopment ? DEVELOPMENT_VALHALLA_BASE_URL : LOCAL_VALHALLA_BASE_URL
}
