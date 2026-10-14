const FAVORITE_STOPS_KEY = 'navus:favorite-stops:v1'

export function readFavoriteStopIds(): readonly string[] {
  try {
    const stored = localStorage.getItem(FAVORITE_STOPS_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.filter((id): id is string => typeof id === 'string')))
      : []
  } catch {
    return []
  }
}

export function writeFavoriteStopIds(stopIds: readonly string[]): void {
  try {
    localStorage.setItem(FAVORITE_STOPS_KEY, JSON.stringify(stopIds))
  } catch {
    // The in-memory view state remains usable when browser storage is unavailable.
  }
}
