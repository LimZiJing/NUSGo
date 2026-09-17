import type { TransitNetwork } from '../types/transit'

export function validateTransitNetwork(network: TransitNetwork): TransitNetwork {
  const stopIds = new Set<string>()
  const routeIds = new Set<string>()

  for (const stop of network.stops) {
    if (stopIds.has(stop.id)) {
      throw new Error(`Duplicate transit stop ID: ${stop.id}`)
    }
    stopIds.add(stop.id)
  }

  for (const route of network.routes) {
    if (routeIds.has(route.id)) {
      throw new Error(`Duplicate transit route ID: ${route.id}`)
    }
    routeIds.add(route.id)

    if (route.stopIds.length < 2) {
      throw new Error(`Transit route ${route.id} must contain at least two stops`)
    }

    const routeStopIds = new Set<string>()
    for (const stopId of route.stopIds) {
      if (!stopIds.has(stopId)) {
        throw new Error(`Transit route ${route.id} references unknown stop: ${stopId}`)
      }
      if (routeStopIds.has(stopId)) {
        throw new Error(`Transit route ${route.id} repeats stop: ${stopId}`)
      }
      routeStopIds.add(stopId)
    }
  }

  return network
}
