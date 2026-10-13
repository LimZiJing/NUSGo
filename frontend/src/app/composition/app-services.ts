import type { LoadedTransitData, LoadedVenueData } from '../contracts/data'
import type { LocationTracker } from '../contracts/location'
import type {
  WalkingConnectionProvider,
  WalkingRouteEngine,
} from '../../pathfinding/walking/walking-contracts'
import type { ShuttleArrivalClient } from '../contracts/shuttle-arrivals'
import type { PublicBusArrivalClient } from '../contracts/public-bus-arrivals'
import type { FindPathsService } from '../../pathfinding/find-paths'
import { createFindPathsService } from '../../pathfinding/find-paths'
import { getValhallaBaseUrl } from '../../pathfinding/walking/valhalla-config'
import { loadTransitMapData, loadVenueData } from '../../infrastructure/data/loaders'
import { createBrowserLocationTracker } from '../../infrastructure/location/browser'
import { createPublicBusArrivalClient } from '../../infrastructure/lta-datamall/client'
import { createValhallaRouteEngine } from '../../pathfinding/walking/valhalla-walking-client'
import { createWalkingConnectionProvider } from '../../pathfinding/walking/walking-connections'
import { createShuttleArrivalClient } from '../../infrastructure/shuttle-arrivals/client'
import {
  createShuttleServiceHoursClient,
  type ShuttleServiceHoursClient,
} from '../../infrastructure/shuttle-service-hours/client'

export interface AppServices {
  readonly loadTransit: (signal: AbortSignal) => Promise<LoadedTransitData>
  readonly loadVenues: (signal: AbortSignal) => Promise<LoadedVenueData>
  readonly createLocationTracker: () => LocationTracker
  readonly shuttleArrivalClient: ShuttleArrivalClient
  readonly publicBusArrivalClient: PublicBusArrivalClient
  readonly shuttleServiceHoursClient: ShuttleServiceHoursClient
  readonly routeEngine: WalkingRouteEngine
  readonly walkingConnectionProvider: WalkingConnectionProvider
  readonly pathfinder: FindPathsService
}

export interface CreateAppServicesOptions {
  readonly journeyTestClock: {
    readonly get: () => number | null
  }
  readonly valhallaBaseUrl?: string
  readonly isDevelopment?: boolean
}

function yieldToBrowser(): Promise<void> {
  const schedulerWithYield = (globalThis as typeof globalThis & {
    scheduler?: { yield?: () => Promise<void> }
  }).scheduler
  if (schedulerWithYield?.yield) return schedulerWithYield.yield()

  if (typeof MessageChannel !== 'undefined') {
    return new Promise((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => {
        channel.port1.close()
        channel.port2.close()
        resolve()
      }
      channel.port2.postMessage(undefined)
    })
  }

  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Creates the shared application collaborators used by the map session and views. */
export function createAppServices(options: CreateAppServicesOptions): AppServices {
  const shuttleArrivalClient = createShuttleArrivalClient()
  const publicBusArrivalClient = createPublicBusArrivalClient()
  const shuttleServiceHoursClient = createShuttleServiceHoursClient()
  const routeEngine = createValhallaRouteEngine({
    baseUrl: getValhallaBaseUrl(
      options.valhallaBaseUrl ?? import.meta.env.VITE_VALHALLA_BASE_URL,
      options.isDevelopment ?? import.meta.env.DEV,
    ),
  })
  const walkingConnectionProvider = createWalkingConnectionProvider({ routeEngine })
  const pathfinder = createFindPathsService({
    routeEngine,
    walkingConnectionProvider,
    getArrivals: (stops, signal) => shuttleArrivalClient.getArrivals(stops, signal),
    getServiceWindows: (routeIds, signal) => shuttleServiceHoursClient.getServiceWindows(routeIds, signal),
    getTestDepartureMs: options.journeyTestClock.get,
    now: Date.now,
    monotonicNow: () => performance.now(),
    yieldControl: yieldToBrowser,
  })

  return {
    loadTransit: loadTransitMapData,
    loadVenues: loadVenueData,
    createLocationTracker: createBrowserLocationTracker,
    shuttleArrivalClient,
    publicBusArrivalClient,
    shuttleServiceHoursClient,
    routeEngine,
    walkingConnectionProvider,
    pathfinder,
  }
}
