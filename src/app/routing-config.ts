const DEVELOPMENT_VALHALLA_BASE_URL = 'https://valhalla1.openstreetmap.de'
const LOCAL_VALHALLA_BASE_URL = 'http://localhost:8002'

export function getValhallaBaseUrl(
  configuredBaseUrl: string | undefined,
  isDevelopment: boolean,
): string {
  if (configuredBaseUrl?.trim()) return configuredBaseUrl
  return isDevelopment ? DEVELOPMENT_VALHALLA_BASE_URL : LOCAL_VALHALLA_BASE_URL
}
