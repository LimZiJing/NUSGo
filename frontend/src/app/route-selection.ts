import type { TransitIndex } from '../domain/transit'
import type { MapRouteSelection } from './contracts/map'

export function reconcileRouteSelection(
  replacementIndex: TransitIndex,
  currentRouteId: string | null,
  replacementOverlapMap: ReadonlyMap<string, ReadonlySet<string>>,
): MapRouteSelection {
  const route = currentRouteId
    ? replacementIndex.routeById.get(currentRouteId) ?? null
    : null

  if (!route) {
    return { route: null, overlappingRouteIds: new Set() }
  }

  const overlappingRouteIds = new Set<string>()
  for (const overlappingRouteId of replacementOverlapMap.get(route.id) ?? []) {
    if (replacementIndex.routeById.has(overlappingRouteId)) {
      overlappingRouteIds.add(overlappingRouteId)
    }
  }

  return { route, overlappingRouteIds }
}
