import type { VenueLocation } from '../venue/types'
import type { TransitIndex } from './index'
import type { TransitRoute, TransitStop } from './types'

const EARTH_RADIUS_METERS = 6_371_008.8
const MAX_NEARBY_STOP_DISTANCE_METERS = 500
const MAX_NEARBY_STOP_COUNT = 3

export interface NearbyShuttleStop {
  readonly stop: TransitStop
  readonly services: readonly TransitRoute[]
}

function getDistanceMeters(
  first: { readonly longitude: number; readonly latitude: number },
  second: { readonly longitude: number; readonly latitude: number },
): number {
  const firstLatitude = first.latitude * Math.PI / 180
  const secondLatitude = second.latitude * Math.PI / 180
  const latitudeDelta = (second.latitude - first.latitude) * Math.PI / 180
  const longitudeDelta = (second.longitude - first.longitude) * Math.PI / 180
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, haversine)))
}

function getInternalServices(stop: TransitStop, transitIndex: TransitIndex): TransitRoute[] {
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
