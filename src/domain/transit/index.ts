import type { TransitNetwork, TransitRoute, TransitStop } from './types'

export interface TransitNetworkIndex {
  readonly routeById: ReadonlyMap<string, TransitRoute>
  readonly stopById: ReadonlyMap<string, TransitStop>
  readonly stopIdsByRouteId: ReadonlyMap<string, ReadonlySet<string>>
  readonly routeIdsByStopId: ReadonlyMap<string, ReadonlySet<string>>
}

export function createTransitNetworkIndex(
  network: TransitNetwork,
): TransitNetworkIndex {
  const routeById = new Map(network.routes.map((route) => [route.id, route]))
  const stopById = new Map(network.stops.map((stop) => [stop.id, stop]))
  const stopIdsByRouteId = new Map(
    network.routes.map((route) => [route.id, new Set(route.stopIds) as ReadonlySet<string>]),
  )
  const routeIdsByStopId = new Map<string, ReadonlySet<string>>()

  for (const route of network.routes) {
    for (const stopId of route.stopIds) {
      const routeIds = new Set(routeIdsByStopId.get(stopId) ?? [])
      routeIds.add(route.id)
      routeIdsByStopId.set(stopId, routeIds)
    }
  }

  return Object.freeze({
    routeById,
    stopById,
    stopIdsByRouteId,
    routeIdsByStopId,
  })
}
