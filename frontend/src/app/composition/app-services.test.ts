import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppServices } from './app-services'

const adapters = vi.hoisted(() => ({
  loadTransit: vi.fn(),
  loadVenues: vi.fn(),
  createLocationTracker: vi.fn(),
  createShuttleArrivalClient: vi.fn(),
  createPublicBusArrivalClient: vi.fn(),
  createShuttleServiceHoursClient: vi.fn(),
  createRouteEngine: vi.fn(),
  createWalkingConnectionProvider: vi.fn(),
  createJourneyPlanningService: vi.fn(),
  locationTracker: {},
  shuttleArrivalClient: {},
  publicBusArrivalClient: {},
  shuttleServiceHoursClient: {},
  routeEngine: {},
  walkingConnectionProvider: {},
  journeyPlanner: vi.fn(),
}))

vi.mock('../../infrastructure/data/loaders', () => ({
  loadTransitMapData: adapters.loadTransit,
  loadVenueData: adapters.loadVenues,
}))
vi.mock('../../infrastructure/location/browser', () => ({
  createBrowserLocationTracker: adapters.createLocationTracker,
}))
vi.mock('../../infrastructure/shuttle-arrivals/client', () => ({
  createShuttleArrivalClient: adapters.createShuttleArrivalClient,
}))
vi.mock('../../infrastructure/lta-datamall/client', () => ({
  createPublicBusArrivalClient: adapters.createPublicBusArrivalClient,
}))
vi.mock('../../infrastructure/shuttle-service-hours/client', () => ({
  createShuttleServiceHoursClient: adapters.createShuttleServiceHoursClient,
}))
vi.mock('../../infrastructure/routing/valhalla', () => ({
  createValhallaRouteEngine: adapters.createRouteEngine,
}))
vi.mock('../../infrastructure/routing/walking-connections', () => ({
  createWalkingConnectionProvider: adapters.createWalkingConnectionProvider,
}))
vi.mock('../journey-planning', () => ({
  createJourneyPlanningService: adapters.createJourneyPlanningService,
}))

describe('createAppServices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adapters.createLocationTracker.mockReturnValue(adapters.locationTracker)
    adapters.createShuttleArrivalClient.mockReturnValue(adapters.shuttleArrivalClient)
    adapters.createPublicBusArrivalClient.mockReturnValue(adapters.publicBusArrivalClient)
    adapters.createShuttleServiceHoursClient.mockReturnValue(adapters.shuttleServiceHoursClient)
    adapters.createRouteEngine.mockReturnValue(adapters.routeEngine)
    adapters.createWalkingConnectionProvider.mockReturnValue(adapters.walkingConnectionProvider)
    adapters.createJourneyPlanningService.mockReturnValue(adapters.journeyPlanner)
  })

  it('shares the Stops timing clients with Journey planning and preserves configured routing', () => {
    const journeyTestClock = { get: vi.fn(() => 1_800_000_000_000) }

    const services = createAppServices({
      journeyTestClock,
      valhallaBaseUrl: 'https://routing.example.test/valhalla',
      isDevelopment: false,
    })

    expect(adapters.createShuttleArrivalClient).toHaveBeenCalledOnce()
    expect(adapters.createShuttleServiceHoursClient).toHaveBeenCalledOnce()
    expect(services.shuttleArrivalClient).toBe(adapters.shuttleArrivalClient)
    expect(services.shuttleServiceHoursClient).toBe(adapters.shuttleServiceHoursClient)
    expect(adapters.createRouteEngine).toHaveBeenCalledWith({
      baseUrl: 'https://routing.example.test/valhalla',
    })
    expect(adapters.createWalkingConnectionProvider).toHaveBeenCalledWith({
      routeEngine: adapters.routeEngine,
    })
    expect(adapters.createJourneyPlanningService).toHaveBeenCalledWith(
      adapters.routeEngine,
      adapters.shuttleArrivalClient,
      adapters.shuttleServiceHoursClient,
      Date.now,
      adapters.walkingConnectionProvider,
      journeyTestClock.get,
    )
    expect(services.journeyPlanner).toBe(adapters.journeyPlanner)
  })

  it('includes the default data loaders, public arrivals client and browser location tracker factory', () => {
    const services = createAppServices({ journeyTestClock: { get: () => null } })

    expect(services.loadTransit).toBe(adapters.loadTransit)
    expect(services.loadVenues).toBe(adapters.loadVenues)
    expect(services.publicBusArrivalClient).toBe(adapters.publicBusArrivalClient)
    expect(services.createLocationTracker).toBe(adapters.createLocationTracker)
  })
})
