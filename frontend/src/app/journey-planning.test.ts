import { describe, expect, it, vi } from 'vitest'
import { createTransitIndex } from '../domain/transit'
import { validateTransitNetwork } from '../domain/transit/model'
import { validateTransitRouteGeometry } from '../domain/transit/geometry'
import { generateShuttleTimingData } from '../domain/transit/timing'
import type { LoadedTransitData } from './contracts/data'
import { createJourneyPlanningService } from './journey-planning'
import { createCurrentLocationTripEndpoint } from '../domain/trip/endpoints'

function createTransitData(): LoadedTransitData {
  const network = validateTransitNetwork({
    version: 1,
    metadata: {
      source: 'test',
      routeStopOrder: 'test',
      routeGeometry: 'test',
      verifiedAt: '2026-09-22',
      routeOrderSource: 'test',
      coordinateSource: 'test',
    },
    routes: [{ id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-A', 'STOP-B'] }],
    stops: [
      { id: 'STOP-A', longName: 'Stop A', shortName: 'A', latitude: 1, longitude: 103, services: ['A1'] },
      { id: 'STOP-B', longName: 'Stop B', shortName: 'B', latitude: 1, longitude: 103.001, services: ['A1'] },
    ],
  })
  const geometry = validateTransitRouteGeometry(network, {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { routeId: 'A1', name: 'A1', color: '#123456' },
      geometry: { type: 'LineString', coordinates: [[103, 1], [103.001, 1]] },
    }],
  })
  const index = createTransitIndex(network)
  return {
    network: index.network,
    geometry,
    index,
    shuttleTiming: generateShuttleTimingData(index.network, geometry, '2026-09-22'),
  }
}

function createAlternativeTransitData(): LoadedTransitData {
  const network = validateTransitNetwork({
    version: 1,
    metadata: {
      source: 'test',
      routeStopOrder: 'test',
      routeGeometry: 'test',
      verifiedAt: '2026-09-22',
      routeOrderSource: 'test',
      coordinateSource: 'test',
    },
    routes: [
      { id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-A', 'STOP-B'] },
      { id: 'B1', name: 'B1', color: '#234567', stopIds: ['STOP-C', 'STOP-D'] },
    ],
    stops: [
      { id: 'STOP-A', longName: 'Stop A', shortName: 'A', latitude: 1, longitude: 103, services: ['A1'] },
      { id: 'STOP-B', longName: 'Stop B', shortName: 'B', latitude: 1, longitude: 103.001, services: ['A1'] },
      { id: 'STOP-C', longName: 'Stop C', shortName: 'C', latitude: 1, longitude: 103.01, services: ['B1'] },
      { id: 'STOP-D', longName: 'Stop D', shortName: 'D', latitude: 1, longitude: 103.011, services: ['B1'] },
    ],
  })
  const geometry = validateTransitRouteGeometry(network, {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { routeId: 'A1', name: 'A1', color: '#123456' }, geometry: { type: 'LineString', coordinates: [[103, 1], [103.001, 1]] } },
      { type: 'Feature', properties: { routeId: 'B1', name: 'B1', color: '#234567' }, geometry: { type: 'LineString', coordinates: [[103.01, 1], [103.011, 1]] } },
    ],
  })
  return {
    network: createTransitIndex(network).network,
    geometry,
    index: createTransitIndex(network),
    shuttleTiming: generateShuttleTimingData(network, geometry, '2026-09-22'),
  }
}

function createFourStopTransitData(): LoadedTransitData {
  const stopIds = ['STOP-A', 'STOP-B', 'STOP-C', 'STOP-D']
  const network = validateTransitNetwork({
    version: 1,
    metadata: {
      source: 'test',
      routeStopOrder: 'test',
      routeGeometry: 'test',
      verifiedAt: '2026-09-22',
      routeOrderSource: 'test',
      coordinateSource: 'test',
    },
    routes: [{ id: 'A1', name: 'A1', color: '#123456', stopIds }],
    stops: stopIds.map((id, index) => ({
      id,
      longName: `Stop ${id.slice(-1)}`,
      shortName: id.slice(-1),
      latitude: 1,
      longitude: 103 + index * 0.001,
      services: ['A1'],
    })),
  })
  const geometry = validateTransitRouteGeometry(network, {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { routeId: 'A1', name: 'A1', color: '#123456' },
      geometry: {
        type: 'LineString',
        coordinates: stopIds.map((_, index) => [103 + index * 0.001, 1]),
      },
    }],
  })
  const index = createTransitIndex(network)
  return {
    network: index.network,
    geometry,
    index,
    shuttleTiming: generateShuttleTimingData(index.network, geometry, '2026-09-22'),
  }
}

function createAlternativeRouteEngine() {
  return {
    matrixWalking: vi.fn(async () => [
      { fromIndex: 0, toIndex: 2, distanceMeters: 100, durationSeconds: 100 },
      { fromIndex: 0, toIndex: 4, distanceMeters: 100, durationSeconds: 100 },
      { fromIndex: 3, toIndex: 1, distanceMeters: 100, durationSeconds: 100 },
      { fromIndex: 5, toIndex: 1, distanceMeters: 100, durationSeconds: 100 },
      { fromIndex: 0, toIndex: 1, distanceMeters: 1_000, durationSeconds: 1_000 },
    ]),
    routeWalking: vi.fn(async ({ origin, destination }) => ({
      distanceMeters: Math.round(Math.abs(destination.longitude - origin.longitude) * 100_000),
      durationSeconds: 100,
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [origin.longitude, origin.latitude] as const,
          [destination.longitude, destination.latitude] as const,
        ],
      },
    })),
  }
}

describe('createJourneyPlanningService', () => {
  it('plans a walking Journey from the frozen Current location coordinate', async () => {
    const transit = createTransitData()
    const currentLocation = createCurrentLocationTripEndpoint({
      longitude: 103.78,
      latitude: 1.29,
    })!
    const routeEngine = {
      matrixWalking: vi.fn(async () => [
        { fromIndex: 0, toIndex: 1, distanceMeters: 250, durationSeconds: 180 },
      ]),
      routeWalking: vi.fn(async ({ origin, destination }) => ({
        distanceMeters: 250,
        durationSeconds: 180,
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [origin.longitude, origin.latitude] as const,
            [destination.longitude, destination.latitude] as const,
          ],
        },
      })),
    }
    const journey = await createJourneyPlanningService(routeEngine)({
      tripRequest: {
        origin: currentLocation,
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        DESTINATION: { roomName: 'Destination', location: { x: 103.79, y: 1.295 } },
      },
      transit,
      signal: new AbortController().signal,
    })

    expect(journey).toMatchObject({
      origin: currentLocation,
      destination: { kind: 'venue', id: 'DESTINATION' },
      legs: [{
        mode: 'walking',
        from: currentLocation,
        to: { kind: 'venue', id: 'DESTINATION' },
        geometry: { coordinates: [[103.78, 1.29], [103.79, 1.295]] },
      }],
    })
    expect(routeEngine.routeWalking).toHaveBeenCalledWith(expect.objectContaining({
      origin: { longitude: 103.78, latitude: 1.29 },
    }), expect.any(AbortSignal))
  })

  it('uses the three shortest reachable venue connectors even when each exceeds five minutes', async () => {
    const transit = createFourStopTransitData()
    const routeEngine = {
      matrixWalking: vi.fn(async () => [
        { fromIndex: 0, toIndex: 2, distanceMeters: 600, durationSeconds: 600 },
        { fromIndex: 0, toIndex: 3, distanceMeters: 700, durationSeconds: 700 },
        { fromIndex: 0, toIndex: 4, distanceMeters: 800, durationSeconds: 800 },
        { fromIndex: 0, toIndex: 5, distanceMeters: 900, durationSeconds: 900 },
        { fromIndex: 2, toIndex: 1, distanceMeters: 100, durationSeconds: 100 },
        { fromIndex: 3, toIndex: 1, distanceMeters: 200, durationSeconds: 200 },
        { fromIndex: 4, toIndex: 1, distanceMeters: 300, durationSeconds: 300 },
        { fromIndex: 5, toIndex: 1, distanceMeters: 400, durationSeconds: 400 },
        { fromIndex: 0, toIndex: 1, distanceMeters: 10_000, durationSeconds: 10_000 },
      ]),
      routeWalking: vi.fn(async ({ origin, destination }) => ({
        distanceMeters: 100,
        durationSeconds: 100,
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [origin.longitude, origin.latitude] as const,
            [destination.longitude, destination.latitude] as const,
          ],
        },
      })),
    }
    const shuttleArrivalClient = {
      getArrivals: vi.fn(async () => ({
        observedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        stops: {
          'STOP-A': { A1: { nextArrivalSeconds: 1_000, upcomingArrivalSeconds: [1_000], headwaySeconds: null } },
          'STOP-B': { A1: { nextArrivalSeconds: 1_000, upcomingArrivalSeconds: [1_000], headwaySeconds: null } },
        },
      })),
    }

    const journey = await createJourneyPlanningService(routeEngine, shuttleArrivalClient)({
      tripRequest: {
        origin: { kind: 'venue', id: 'ORIGIN' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.005, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    })

    expect(shuttleArrivalClient.getArrivals).toHaveBeenCalledWith(
      [
        { stopId: 'STOP-A', stopName: 'Stop A' },
        { stopId: 'STOP-B', stopName: 'Stop B' },
      ],
      expect.any(AbortSignal),
    )
    expect(journey?.legs.some((leg) => leg.mode === 'shuttle')).toBe(true)
    expect(journey?.legs[0]).toMatchObject({ mode: 'walking', durationSeconds: 600 })
    expect(journey?.legs.find((leg) => leg.mode === 'shuttle')).toMatchObject({ waitingSeconds: 400 })
    expect(journey?.legs.find((leg) => leg.mode === 'shuttle' && leg.alightingStopId === 'STOP-D'))
      .toBeUndefined()
  })

  it('converts walking matrix results and route geometry into a shuttle Journey', async () => {
    const transit = createTransitData()
    const routeEngine = {
      matrixWalking: vi.fn(async () => [
        { fromIndex: 0, toIndex: 1, distanceMeters: 500, durationSeconds: 500 },
        { fromIndex: 0, toIndex: 2, distanceMeters: 100, durationSeconds: 100 },
        { fromIndex: 3, toIndex: 1, distanceMeters: 100, durationSeconds: 100 },
      ]),
      routeWalking: vi.fn(async ({ origin, destination }) => ({
        distanceMeters: Math.round(Math.abs(destination.longitude - origin.longitude) * 100_000),
        durationSeconds: 100,
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [origin.longitude, origin.latitude] as const,
            [destination.longitude, destination.latitude] as const,
          ],
        },
      })),
    }
    const service = createJourneyPlanningService(routeEngine)

    const journey = await service({
      tripRequest: {
        origin: { kind: 'venue', id: 'ORIGIN' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.002, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    })

    expect(journey?.legs.map((leg) => leg.mode)).toEqual(['walking', 'shuttle', 'walking'])
    expect(journey?.legs[1]).toMatchObject({ routeId: 'A1', waitingSeconds: 0 })
    expect(routeEngine.matrixWalking).toHaveBeenCalledOnce()
    expect(routeEngine.routeWalking).toHaveBeenCalledTimes(2)
  })

  it('uses the walking connection provider instead of the full matrix', async () => {
    const transit = createTransitData()
    const routeEngine = {
      matrixWalking: vi.fn(async () => {
        throw new Error('The full walking matrix should not be requested')
      }),
      routeWalking: vi.fn(async ({ origin, destination }) => ({
        distanceMeters: 100,
        durationSeconds: 100,
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [origin.longitude, origin.latitude] as const,
            [destination.longitude, destination.latitude] as const,
          ],
        },
      })),
    }
    const walkingConnectionProvider = {
      getWalkingConnections: vi.fn(async () => [
        {
          fromKey: 'venue:ORIGIN',
          toKey: 'stop:STOP-A',
          distanceMeters: 100,
          durationSeconds: 100,
        },
        {
          fromKey: 'stop:STOP-B',
          toKey: 'venue:DESTINATION',
          distanceMeters: 100,
          durationSeconds: 100,
        },
        {
          fromKey: 'venue:ORIGIN',
          toKey: 'venue:DESTINATION',
          distanceMeters: 10_000,
          durationSeconds: 10_000,
        },
      ]),
    }
    const service = createJourneyPlanningService(
      routeEngine,
      undefined,
      undefined,
      Date.now,
      walkingConnectionProvider,
    )

    const journey = await service({
      tripRequest: {
        origin: { kind: 'venue', id: 'ORIGIN' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.002, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    })

    expect(journey?.legs.map((leg) => leg.mode)).toEqual(['walking', 'shuttle', 'walking'])
    expect(walkingConnectionProvider.getWalkingConnections).toHaveBeenCalledOnce()
    expect(routeEngine.matrixWalking).not.toHaveBeenCalled()
  })

  it('keeps a selected stop fixed when considering one-shuttle options', async () => {
    const transit = createAlternativeTransitData()
    const routeEngine = {
      matrixWalking: vi.fn(async () => []),
      routeWalking: vi.fn(async ({ origin, destination }) => ({
        distanceMeters: 100,
        durationSeconds: 100,
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [origin.longitude, origin.latitude] as const,
            [destination.longitude, destination.latitude] as const,
          ],
        },
      })),
    }
    const walkingConnectionProvider = {
      getWalkingConnections: vi.fn(async () => [
        { fromKey: 'stop:STOP-A', toKey: 'stop:STOP-C', distanceMeters: 20, durationSeconds: 20 },
        { fromKey: 'stop:STOP-B', toKey: 'venue:DESTINATION', distanceMeters: 100, durationSeconds: 100 },
        { fromKey: 'stop:STOP-D', toKey: 'venue:DESTINATION', distanceMeters: 100, durationSeconds: 100 },
        { fromKey: 'stop:STOP-A', toKey: 'venue:DESTINATION', distanceMeters: 5_000, durationSeconds: 5_000 },
      ]),
    }
    const shuttleArrivalClient = {
      getArrivals: vi.fn(async () => ({
        observedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        stops: {
          'STOP-A': {
            A1: {
              nextArrivalSeconds: 120,
              upcomingArrivalSeconds: [120],
              headwaySeconds: null,
            },
          },
        },
      })),
    }

    const journey = await createJourneyPlanningService(
      routeEngine,
      shuttleArrivalClient,
      undefined,
      Date.now,
      walkingConnectionProvider,
    )({
      tripRequest: {
        origin: { kind: 'stop', id: 'STOP-A' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        DESTINATION: { roomName: 'Destination', location: { x: 103.012, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    })

    expect(shuttleArrivalClient.getArrivals).toHaveBeenCalledWith(
      [{ stopId: 'STOP-A', stopName: 'Stop A' }],
      expect.any(AbortSignal),
    )
    expect(journey?.legs.find((leg) => leg.mode === 'shuttle')).toMatchObject({
      routeId: 'A1',
      boardingStopId: 'STOP-A',
      alightingStopId: 'STOP-B',
    })
  })

  it('does not hide aborted walking requests as no-route results', async () => {
    const transit = createTransitData()
    const controller = new AbortController()
    const routeEngine = {
      matrixWalking: vi.fn(async () => {
        controller.abort()
        return []
      }),
      routeWalking: vi.fn(),
    }

    await expect(createJourneyPlanningService(routeEngine)({
      tripRequest: {
        origin: { kind: 'venue', id: 'ORIGIN' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.002, y: 1 } },
      },
      transit,
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('uses live arrival data for the boarding wait', async () => {
    const transit = createTransitData()
    const routeEngine = {
      matrixWalking: vi.fn(async () => [
        { fromIndex: 0, toIndex: 1, distanceMeters: 500, durationSeconds: 500 },
        { fromIndex: 0, toIndex: 2, distanceMeters: 100, durationSeconds: 100 },
        { fromIndex: 3, toIndex: 1, distanceMeters: 100, durationSeconds: 100 },
      ]),
      routeWalking: vi.fn(async ({ origin, destination }) => ({
        distanceMeters: Math.round(Math.abs(destination.longitude - origin.longitude) * 100_000),
        durationSeconds: 100,
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [origin.longitude, origin.latitude] as const,
            [destination.longitude, destination.latitude] as const,
          ],
        },
      })),
    }
    const shuttleArrivalClient = {
      getArrivals: vi.fn(async () => ({
        observedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        stops: {
          'STOP-A': {
            A1: {
              nextArrivalSeconds: 120,
              upcomingArrivalSeconds: [120, 480],
              headwaySeconds: { min: 360, max: 360, median: 360 },
            },
          },
        },
      })),
    }
    const journey = await createJourneyPlanningService(routeEngine, shuttleArrivalClient)({
      tripRequest: {
        origin: { kind: 'venue', id: 'ORIGIN' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.002, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    })

    expect(shuttleArrivalClient.getArrivals).toHaveBeenCalledWith(
      [
        { stopId: 'STOP-A', stopName: 'Stop A' },
      ],
      expect.any(AbortSignal),
    )
    expect(journey?.legs[1]).toMatchObject({ waitingSeconds: 20 })
  })

  it('allows waiting before service starts when boarding occurs during service', async () => {
    const transit = createTransitData()
    const nowMs = Date.parse('2026-09-23T22:30:00.000Z')
    const routeEngine = {
      matrixWalking: vi.fn(async () => [
        { fromIndex: 0, toIndex: 1, distanceMeters: 10_000, durationSeconds: 10_000 },
        { fromIndex: 0, toIndex: 2, distanceMeters: 100, durationSeconds: 100 },
        { fromIndex: 3, toIndex: 1, distanceMeters: 100, durationSeconds: 100 },
      ]),
      routeWalking: vi.fn(async ({ origin, destination }) => ({
        distanceMeters: Math.round(Math.abs(destination.longitude - origin.longitude) * 100_000),
        durationSeconds: 100,
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [origin.longitude, origin.latitude] as const,
            [destination.longitude, destination.latitude] as const,
          ],
        },
      })),
    }
    const shuttleArrivalClient = {
      getArrivals: vi.fn(async () => ({
        observedAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(nowMs + 3_600_000).toISOString(),
        stops: {
          'STOP-A': {
            A1: {
              nextArrivalSeconds: 3_000,
              upcomingArrivalSeconds: [3_000],
              headwaySeconds: null,
            },
          },
        },
      })),
    }
    const shuttleServiceHoursClient = {
      getServiceWindows: vi.fn(async () => ({
        A1: [{ routeId: 'A1', firstTime: '07:15', lastTime: '23:00', dayType: 'Mon-Fri', dates: [] }],
      })),
    }

    const journey = await createJourneyPlanningService(
      routeEngine,
      shuttleArrivalClient,
      shuttleServiceHoursClient,
      () => nowMs,
    )({
      tripRequest: {
        origin: { kind: 'venue', id: 'ORIGIN' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.002, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    })

    expect(journey?.legs.some((leg) => leg.mode === 'shuttle')).toBe(true)
    expect(journey?.legs.find((leg) => leg.mode === 'shuttle')).toMatchObject({
      waitingSeconds: 2_900,
    })
  })

  it('rejects boarding after service ends even when reaching the stop during service', async () => {
    const transit = createTransitData()
    const nowMs = Date.parse('2026-09-23T23:18:00.000Z')
    const routeEngine = {
      matrixWalking: vi.fn(async () => [
        { fromIndex: 0, toIndex: 1, distanceMeters: 10_000, durationSeconds: 10_000 },
        { fromIndex: 0, toIndex: 2, distanceMeters: 100, durationSeconds: 100 },
        { fromIndex: 3, toIndex: 1, distanceMeters: 100, durationSeconds: 100 },
      ]),
      routeWalking: vi.fn(async ({ origin, destination }) => ({
        distanceMeters: Math.round(Math.abs(destination.longitude - origin.longitude) * 100_000),
        durationSeconds: 100,
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [origin.longitude, origin.latitude] as const,
            [destination.longitude, destination.latitude] as const,
          ],
        },
      })),
    }
    const shuttleArrivalClient = {
      getArrivals: vi.fn(async () => ({
        observedAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(nowMs + 3_600_000).toISOString(),
        stops: {
          'STOP-A': {
            A1: {
              nextArrivalSeconds: 180,
              upcomingArrivalSeconds: [180],
              headwaySeconds: null,
            },
          },
        },
      })),
    }
    const shuttleServiceHoursClient = {
      getServiceWindows: vi.fn(async () => ({
        A1: [{ routeId: 'A1', firstTime: '07:15', lastTime: '07:20', dayType: 'Mon-Fri', dates: [] }],
      })),
    }

    const journey = await createJourneyPlanningService(
      routeEngine,
      shuttleArrivalClient,
      shuttleServiceHoursClient,
      () => nowMs,
    )({
      tripRequest: {
        origin: { kind: 'venue', id: 'ORIGIN' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.002, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    })

    expect(journey?.legs.some((leg) => leg.mode === 'shuttle')).toBe(false)
    expect(journey?.legs).toHaveLength(1)
    expect(journey?.legs[0].mode).toBe('walking')
  })

  it('requests live arrivals only for nearby boarding stops', async () => {
    const transit = createTransitData()
    const routeEngine = {
      matrixWalking: vi.fn(async () => [
        { fromIndex: 0, toIndex: 2, distanceMeters: 100, durationSeconds: 100 },
        { fromIndex: 0, toIndex: 3, distanceMeters: 500, durationSeconds: 500 },
        { fromIndex: 3, toIndex: 1, distanceMeters: 100, durationSeconds: 100 },
        { fromIndex: 0, toIndex: 1, distanceMeters: 1_000, durationSeconds: 1_000 },
      ]),
      routeWalking: vi.fn(async ({ origin, destination }) => ({
        distanceMeters: Math.round(Math.abs(destination.longitude - origin.longitude) * 100_000),
        durationSeconds: 100,
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [origin.longitude, origin.latitude] as const,
            [destination.longitude, destination.latitude] as const,
          ],
        },
      })),
    }
    const shuttleArrivalClient = {
      getArrivals: vi.fn(async () => ({
        observedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        stops: {
          'STOP-A': {
            A1: {
              nextArrivalSeconds: 120,
              upcomingArrivalSeconds: [120],
              headwaySeconds: null,
            },
          },
        },
      })),
    }

    await createJourneyPlanningService(routeEngine, shuttleArrivalClient)({
      tripRequest: {
        origin: { kind: 'venue', id: 'ORIGIN' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.002, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    })

    expect(shuttleArrivalClient.getArrivals).toHaveBeenCalledWith(
      [{ stopId: 'STOP-A', stopName: 'Stop A' }],
      expect.any(AbortSignal),
    )
  })

  it('lets a better-timed alternative replace the static winner', async () => {
    const transit = createAlternativeTransitData()
    const routeEngine = createAlternativeRouteEngine()
    const shuttleArrivalClient = {
      getArrivals: vi.fn(async () => ({
        observedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        stops: {
          'STOP-A': {
            A1: {
              nextArrivalSeconds: 600,
              upcomingArrivalSeconds: [600],
              headwaySeconds: null,
            },
          },
          'STOP-C': {
            B1: {
              nextArrivalSeconds: 200,
              upcomingArrivalSeconds: [200],
              headwaySeconds: null,
            },
          },
        },
      })),
    }

    const journey = await createJourneyPlanningService(routeEngine, shuttleArrivalClient)({
      tripRequest: {
        origin: { kind: 'venue', id: 'ORIGIN' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.012, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    })

    expect(shuttleArrivalClient.getArrivals).toHaveBeenCalledWith(
      [
        { stopId: 'STOP-A', stopName: 'Stop A' },
        { stopId: 'STOP-C', stopName: 'Stop C' },
      ],
      expect.any(AbortSignal),
    )
    expect(journey?.legs.some((leg) => leg.mode === 'shuttle' && leg.routeId === 'B1')).toBe(true)
  })

  it('uses direct walking when a transfer is required to reach the destination', async () => {
    const transit = createAlternativeTransitData()
    const routeEngine = createAlternativeRouteEngine()
    routeEngine.matrixWalking.mockResolvedValue([
      { fromIndex: 0, toIndex: 2, distanceMeters: 100, durationSeconds: 100 },
      { fromIndex: 3, toIndex: 4, distanceMeters: 50, durationSeconds: 50 },
      { fromIndex: 5, toIndex: 1, distanceMeters: 100, durationSeconds: 100 },
      { fromIndex: 0, toIndex: 1, distanceMeters: 1_000, durationSeconds: 1_000 },
    ])

    const journey = await createJourneyPlanningService(routeEngine)({
      tripRequest: {
        origin: { kind: 'venue', id: 'ORIGIN' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.012, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    })

    expect(journey?.legs.map((leg) => leg.mode)).toEqual(['walking'])
    expect(journey?.totalDurationSeconds).toBe(1_000)
  })

  it('does not request live arrivals for shuttle stops reached only after a transfer', async () => {
    const transit = createAlternativeTransitData()
    const routeEngine = createAlternativeRouteEngine()
    routeEngine.matrixWalking.mockResolvedValue([
      { fromIndex: 0, toIndex: 2, distanceMeters: 100, durationSeconds: 100 },
      { fromIndex: 3, toIndex: 4, distanceMeters: 50, durationSeconds: 50 },
      { fromIndex: 5, toIndex: 1, distanceMeters: 100, durationSeconds: 100 },
      { fromIndex: 0, toIndex: 1, distanceMeters: 1_000, durationSeconds: 1_000 },
    ])
    const shuttleArrivalClient = {
      getArrivals: vi.fn(async () => ({
        observedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        stops: {
          'STOP-A': {
            A1: {
              nextArrivalSeconds: 120,
              upcomingArrivalSeconds: [120],
              headwaySeconds: null,
            },
          },
          'STOP-C': {
            B1: {
              nextArrivalSeconds: 250,
              upcomingArrivalSeconds: [250],
              headwaySeconds: null,
            },
          },
        },
      })),
    }

    const journey = await createJourneyPlanningService(routeEngine, shuttleArrivalClient)({
      tripRequest: {
        origin: { kind: 'venue', id: 'ORIGIN' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.012, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    })

    expect(shuttleArrivalClient.getArrivals).not.toHaveBeenCalled()
    expect(journey?.legs.map((leg) => leg.mode)).toEqual(['walking'])
  })

  it('uses a complete one-shuttle route with a walking leg after alighting', async () => {
    const transit = createAlternativeTransitData()
    const routeEngine = createAlternativeRouteEngine()
    routeEngine.matrixWalking.mockResolvedValue([
      { fromIndex: 0, toIndex: 2, distanceMeters: 100, durationSeconds: 100 },
      { fromIndex: 3, toIndex: 4, distanceMeters: 50, durationSeconds: 50 },
      { fromIndex: 3, toIndex: 1, distanceMeters: 200, durationSeconds: 200 },
      { fromIndex: 5, toIndex: 1, distanceMeters: 100, durationSeconds: 100 },
      { fromIndex: 0, toIndex: 1, distanceMeters: 1_000, durationSeconds: 1_000 },
    ])
    const shuttleArrivalClient = {
      getArrivals: vi.fn(async () => ({
        observedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        stops: {
          'STOP-A': {
            A1: {
              nextArrivalSeconds: 120,
              upcomingArrivalSeconds: [120],
              headwaySeconds: null,
            },
          },
        },
      })),
    }

    const journey = await createJourneyPlanningService(routeEngine, shuttleArrivalClient)({
      tripRequest: {
        origin: { kind: 'venue', id: 'ORIGIN' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.012, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    })

    expect(journey?.legs.map((leg) => leg.mode)).toEqual(['walking', 'shuttle', 'walking'])
    expect(journey?.legs.find((leg) => leg.mode === 'shuttle')).toMatchObject({
      routeId: 'A1',
      boardingStopId: 'STOP-A',
      alightingStopId: 'STOP-B',
    })
  })

  it('does not use stop-to-stop walking to create a transfer', async () => {
    const transit = createAlternativeTransitData()
    const routeEngine = createAlternativeRouteEngine()
    routeEngine.matrixWalking.mockResolvedValue([
      { fromIndex: 0, toIndex: 2, distanceMeters: 100, durationSeconds: 100 },
      { fromIndex: 3, toIndex: 4, distanceMeters: 500, durationSeconds: 500 },
      { fromIndex: 5, toIndex: 1, distanceMeters: 100, durationSeconds: 100 },
      { fromIndex: 0, toIndex: 1, distanceMeters: 1_000, durationSeconds: 1_000 },
    ])

    const journey = await createJourneyPlanningService(routeEngine)({
      tripRequest: {
        origin: { kind: 'venue', id: 'ORIGIN' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.012, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    })

    expect(journey?.legs).toHaveLength(1)
    expect(journey?.legs[0].mode).toBe('walking')
  })

  it('keeps the walking-only Journey when live timing removes every shuttle edge', async () => {
    const transit = createAlternativeTransitData()
    const routeEngine = createAlternativeRouteEngine()
    const shuttleArrivalClient = {
      getArrivals: vi.fn(async () => ({
        observedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        stops: {},
      })),
    }

    const journey = await createJourneyPlanningService(routeEngine, shuttleArrivalClient)({
      tripRequest: {
        origin: { kind: 'venue', id: 'ORIGIN' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.012, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    })

    expect(journey?.legs).toHaveLength(1)
    expect(journey?.legs[0].mode).toBe('walking')
    expect(journey?.totalDurationSeconds).toBe(1_000)
  })

  it('throws when live arrival data cannot be fetched', async () => {
    const transit = createAlternativeTransitData()
    const routeEngine = createAlternativeRouteEngine()
    const shuttleArrivalClient = {
      getArrivals: vi.fn(async () => {
        throw new Error('Live shuttle API unavailable')
      }),
    }

    await expect(createJourneyPlanningService(routeEngine, shuttleArrivalClient)({
      tripRequest: {
        origin: { kind: 'venue', id: 'ORIGIN' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.012, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    })).rejects.toThrow('Live shuttle API unavailable')
  })

  it('does not return a shuttle journey after the route service window ends', async () => {
    const transit = createTransitData()
    const routeEngine = {
      matrixWalking: vi.fn(async () => [
        { fromIndex: 0, toIndex: 2, distanceMeters: 100, durationSeconds: 100 },
        { fromIndex: 3, toIndex: 1, distanceMeters: 100, durationSeconds: 100 },
      ]),
      routeWalking: vi.fn(async ({ origin, destination }) => ({
        distanceMeters: Math.round(Math.abs(destination.longitude - origin.longitude) * 100_000),
        durationSeconds: 100,
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [origin.longitude, origin.latitude] as const,
            [destination.longitude, destination.latitude] as const,
          ],
        },
      })),
    }
    const shuttleArrivalClient = {
      getArrivals: vi.fn(async () => ({
        observedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        stops: {},
      })),
    }
    const shuttleServiceHoursClient = {
      getServiceWindows: vi.fn(async () => ({
        A1: [{ routeId: 'A1', firstTime: '07:15', lastTime: '07:20', dayType: 'Mon-Fri', dates: [] }],
      })),
    }

    await expect(createJourneyPlanningService(
      routeEngine,
      shuttleArrivalClient,
      shuttleServiceHoursClient,
      () => new Date('2026-09-23T02:00:00.000Z').getTime(),
    )({
      tripRequest: {
        origin: { kind: 'venue', id: 'ORIGIN' },
        destination: { kind: 'venue', id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.002, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({
      name: 'NoJourneyAvailableError',
      message: 'Shuttle service has ended for today. It resumes tomorrow at 7:15 AM.',
    })
  })

  it('uses fixed test waits and the selected service window without fetching live arrivals', async () => {
    const transit = createTransitData()
    const routeEngine = {
      matrixWalking: vi.fn(async () => [
        { fromIndex: 0, toIndex: 1, distanceMeters: 2_000, durationSeconds: 2_000 },
        { fromIndex: 0, toIndex: 2, distanceMeters: 100, durationSeconds: 100 },
        { fromIndex: 3, toIndex: 1, distanceMeters: 100, durationSeconds: 100 },
      ]),
      routeWalking: vi.fn(async ({ origin, destination }) => ({
        distanceMeters: Math.round(Math.abs(destination.longitude - origin.longitude) * 100_000),
        durationSeconds: 100,
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [origin.longitude, origin.latitude] as const,
            [destination.longitude, destination.latitude] as const,
          ],
        },
      })),
    }
    const shuttleArrivalClient = { getArrivals: vi.fn() }
    const shuttleServiceHoursClient = {
      getServiceWindows: vi.fn(async () => ({
        A1: [{ routeId: 'A1', firstTime: '07:15', lastTime: '23:00', dayType: 'Mon-Fri', dates: [] }],
      })),
    }
    let testDepartureMs = Date.parse('2026-09-23T04:00:00Z')
    const service = createJourneyPlanningService(
      routeEngine,
      shuttleArrivalClient,
      shuttleServiceHoursClient,
      Date.now,
      undefined,
      () => testDepartureMs,
    )
    const request = {
      tripRequest: {
        origin: { kind: 'venue' as const, id: 'ORIGIN' },
        destination: { kind: 'venue' as const, id: 'DESTINATION' },
      },
      venues: {
        ORIGIN: { roomName: 'Origin', location: { x: 102.999, y: 1 } },
        DESTINATION: { roomName: 'Destination', location: { x: 103.002, y: 1 } },
      },
      transit,
      signal: new AbortController().signal,
    }

    const activeJourney = await service(request)
    expect(activeJourney?.legs.find((leg) => leg.mode === 'shuttle')).toMatchObject({ waitingSeconds: 300 })
    expect(shuttleArrivalClient.getArrivals).not.toHaveBeenCalled()

    testDepartureMs = Date.parse('2026-09-23T15:25:00Z')
    const endedJourney = await service(request)
    expect(endedJourney?.legs.every((leg) => leg.mode === 'walking')).toBe(true)
    expect(shuttleArrivalClient.getArrivals).not.toHaveBeenCalled()
  })
})
