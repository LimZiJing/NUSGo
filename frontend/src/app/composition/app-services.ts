import type { LoadedTransitData, LoadedVenueData } from '../contracts/data'
import type { LocationTracker } from '../contracts/location'
import type {
  WalkingConnectionProvider,
  WalkingRouteEngine,
} from '../contracts/routing'
import type { ShuttleArrivalClient } from '../contracts/shuttle-arrivals'
import type { PublicBusArrivalClient } from '../contracts/public-bus-arrivals'
import type { JourneyPlanningService } from '../journey-planning'
import { getValhallaBaseUrl } from '../routing-config'
import { createJourneyPlanningService } from '../journey-planning'
import { loadTransitMapData, loadVenueData } from '../../infrastructure/data/loaders'
import { createBrowserLocationTracker } from '../../infrastructure/location/browser'
import { createPublicBusArrivalClient } from '../../infrastructure/lta-datamall/client'
import { createValhallaRouteEngine } from '../../infrastructure/routing/valhalla'
import { createWalkingConnectionProvider } from '../../infrastructure/routing/walking-connections'
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
  readonly journeyPlanner: JourneyPlanningService
}

export interface CreateAppServicesOptions {
  readonly journeyTestClock: {
    readonly get: () => number | null
  }
  readonly valhallaBaseUrl?: string
  readonly isDevelopment?: boolean
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
  const journeyPlanner = createJourneyPlanningService(
    routeEngine,
    shuttleArrivalClient,
    shuttleServiceHoursClient,
    Date.now,
    walkingConnectionProvider,
    options.journeyTestClock.get,
  )

  return {
    loadTransit: loadTransitMapData,
    loadVenues: loadVenueData,
    createLocationTracker: createBrowserLocationTracker,
    shuttleArrivalClient,
    publicBusArrivalClient,
    shuttleServiceHoursClient,
    routeEngine,
    walkingConnectionProvider,
    journeyPlanner,
  }
}
