import type { VenueLocation } from '@navus/shared/venue/types'
import { getDistanceMeters } from '../location/coordinates'
import type { TransitIndex } from './index'
import type { BusRoute, TransitStop } from '@navus/shared/transit/types'

const MAX_NEARBY_STOP_DISTANCE_METERS = 500
const MAX_NEARBY_STOP_COUNT = 3

export interface NearbyShuttleStop {
  readonly stop: TransitStop
  readonly services: readonly BusRoute[]
}

function getInternalServices(stop: TransitStop, transitIndex: TransitIndex): BusRoute[] {
  return stop.services.flatMap((serviceId) => {
    const route = transitIndex.routeById.get(serviceId)
    return route ? [route] : []
  })
}

export function findNearbyShuttleStops(
  venueLocation: VenueLocation['location'] | null | undefined,
  transitIndex: TransitIndex,
): NearbyShuttleStop[] {
  if (!venueLocation || !Number.isFinite(venueLocation.x) || !Number.isFinite(venueLocation.y)) return []

  return transitIndex.stops
    .flatMap((stop) => {
      const services = getInternalServices(stop, transitIndex)
      if (services.length === 0) return []
      const distance = getDistanceMeters(
        { longitude: venueLocation.x, latitude: venueLocation.y },
        { longitude: stop.longitude, latitude: stop.latitude },
      )
      return distance <= MAX_NEARBY_STOP_DISTANCE_METERS ? [{ stop, services, distance }] : []
    })
    .sort((first, second) => first.distance - second.distance || first.stop.id.localeCompare(second.stop.id))
    .slice(0, MAX_NEARBY_STOP_COUNT)
    .map(({ stop, services }) => Object.freeze({ stop, services: Object.freeze(services) }))
}
