import type { LoadedTransitData, LoadedVenueData } from '../contracts/data'
import type { LocationTracker } from '../contracts/location'
import type { ShuttleArrivalClient } from '../contracts/shuttle-arrivals'
import type { ShuttleVehicleClient } from '../contracts/shuttle-vehicles'
import type { PublicBusArrivalClient } from '../contracts/public-bus-arrivals'
import type { JourneyPlanningClient } from '../../infrastructure/pathfinding/client'
import { createJourneyPlanningClient } from '../../infrastructure/pathfinding/client'
import { loadTransitMapData, loadVenueData } from '../../infrastructure/data/loaders'
import { createBrowserLocationTracker } from '../../infrastructure/location/browser'
import { createPublicBusArrivalClient } from '../../infrastructure/lta-datamall/client'
import { createShuttleArrivalClient } from '../../infrastructure/shuttle-arrivals/client'
import { createShuttleVehicleClient } from '../../infrastructure/shuttle-vehicles/client'
import {
  createShuttleServiceHoursClient,
  type ShuttleServiceHoursClient,
} from '../../infrastructure/shuttle-service-hours/client'

export interface AppServices {
  readonly loadTransit: (signal: AbortSignal) => Promise<LoadedTransitData>
  readonly loadVenues: (signal: AbortSignal) => Promise<LoadedVenueData>
  readonly createLocationTracker: () => LocationTracker
  readonly shuttleArrivalClient: ShuttleArrivalClient
  readonly shuttleVehicleClient: ShuttleVehicleClient
  readonly publicBusArrivalClient: PublicBusArrivalClient
  readonly shuttleServiceHoursClient: ShuttleServiceHoursClient
  readonly pathfinder: JourneyPlanningClient
}

export interface CreateAppServicesOptions {
  readonly journeyTestClock: {
    readonly get: () => number | null
  }
  readonly isDevelopment?: boolean
}

/** Creates the browser collaborators; Journey candidates and routed geometry come from Express. */
export function createAppServices(options: CreateAppServicesOptions): AppServices {
  const shuttleArrivalClient = createShuttleArrivalClient()
  const shuttleVehicleClient = createShuttleVehicleClient()
  const publicBusArrivalClient = createPublicBusArrivalClient()
  const shuttleServiceHoursClient = createShuttleServiceHoursClient()
  const isDevelopment = options.isDevelopment ?? import.meta.env.DEV
  const pathfinder = createJourneyPlanningClient({
    getSimulatedDepartureMs: isDevelopment ? options.journeyTestClock.get : () => null,
  })

  return {
    loadTransit: loadTransitMapData,
    loadVenues: loadVenueData,
    createLocationTracker: createBrowserLocationTracker,
    shuttleArrivalClient,
    shuttleVehicleClient,
    publicBusArrivalClient,
    shuttleServiceHoursClient,
    pathfinder,
  }
}
