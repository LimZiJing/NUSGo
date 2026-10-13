import type { LoadedTransitData } from '../app/contracts/data'
import type { TripRequest } from '../domain/trip/types'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import type { ShuttleArrivalClient } from '../app/contracts/shuttle-arrivals'
import type { ShuttleServiceHoursClient } from '../infrastructure/shuttle-service-hours/client'
import type {
  WalkingConnection,
  WalkingConnectionProvider,
  WalkingRouteEngine,
} from './walking/walking-contracts'
import {
  createFindPathsService,
  type FindPathsResult,
} from './find-paths'

interface TestRequest {
  readonly tripRequest: TripRequest
  readonly venues: VenueLocationMap
  readonly transit: LoadedTransitData
  readonly signal: AbortSignal
}

function createMatrixTestProvider(routeEngine: WalkingRouteEngine): WalkingConnectionProvider {
  return {
    async getWalkingConnections(request, signal) {
      // Legacy regression fixtures model walking costs as one all-pairs matrix; production injects the directed graph provider.
      const locations = new Map([
        [request.origin.key, request.origin],
        [request.destination.key, request.destination],
        ...request.stops.map((stop) => [stop.key, stop] as const),
      ])
      const orderedLocations = [...locations.values()]
      const matrix = await routeEngine.matrixWalking({
        sources: orderedLocations.map((location) => location.coordinate),
        targets: orderedLocations.map((location) => location.coordinate),
      }, signal)

      return matrix.flatMap((connection): readonly WalkingConnection[] => {
        const from = orderedLocations[connection.fromIndex]
        const to = orderedLocations[connection.toIndex]
        if (!from || !to) return []
        return [{
          fromKey: from.key,
          toKey: to.key,
          distanceMeters: connection.distanceMeters,
          durationSeconds: connection.durationSeconds,
        }]
      })
    },
  }
}

/** Adapts the app-shaped fixtures so these regression tests exercise the new public boundary. */
export function createFindPathsTestService(
  routeEngine: WalkingRouteEngine,
  shuttleArrivalClient?: ShuttleArrivalClient,
  shuttleServiceHoursClient?: ShuttleServiceHoursClient,
  now: () => number = Date.now,
  walkingConnectionProvider?: WalkingConnectionProvider,
  getTestDepartureMs: () => number | null = () => null,
): (request: TestRequest) => Promise<FindPathsResult | null> {
  const service = createFindPathsService({
    routeEngine,
    walkingConnectionProvider: walkingConnectionProvider ?? createMatrixTestProvider(routeEngine),
    getArrivals: shuttleArrivalClient
      ? (stops, signal) => shuttleArrivalClient.getArrivals(stops, signal)
      : undefined,
    getServiceWindows: shuttleServiceHoursClient
      ? (routeIds, signal) => shuttleServiceHoursClient.getServiceWindows(routeIds, signal)
      : undefined,
    getTestDepartureMs,
    now,
    monotonicNow: () => performance.now(),
    yieldControl: () => Promise.resolve(),
  })

  return (request) => {
    const { origin, destination } = request.tripRequest
    if (!origin || !destination) return Promise.resolve(null)
    return service({
      origin,
      destination,
      venues: request.venues,
      transit: {
        index: request.transit.index,
        geometry: request.transit.geometry,
        shuttleTiming: request.transit.shuttleTiming,
      },
    }, { signal: request.signal })
  }
}
