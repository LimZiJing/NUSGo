import type { TransitIndex } from './index'
import type { TransitStop } from '@navus/shared/transit/types'

const MAX_REACHABLE_FAVORITE_STOPS = 3

export function getReachableFavoriteStops(
  index: TransitIndex,
  routeId: string,
  fromStopId: string,
  favoriteStopIds: ReadonlySet<string>,
): readonly TransitStop[] {
  const route = index.routeById.get(routeId)
  if (!route) return []

  const fromIndex = route.stopIds.indexOf(fromStopId)
  if (fromIndex < 0) return []

  const closingStopIndex = route.stopIds.length > 1 && route.stopIds.at(-1) === route.stopIds[0]
    ? route.stopIds.length - 1
    : route.stopIds.length

  return route.stopIds
    .slice(fromIndex + 1, closingStopIndex)
    .filter((stopId) => favoriteStopIds.has(stopId))
    .flatMap((stopId) => {
      const stop = index.stopById.get(stopId)
      return stop ? [stop] : []
    })
    .slice(0, MAX_REACHABLE_FAVORITE_STOPS)
}
