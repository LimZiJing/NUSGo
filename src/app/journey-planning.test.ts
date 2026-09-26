import { describe, expect, it, vi } from 'vitest'
import { createTransitIndex } from '../domain/transit'
import { validateTransitNetwork } from '../domain/transit/model'
import { validateTransitRouteGeometry } from '../domain/transit/geometry'
import { generateShuttleTimingData } from '../domain/transit/timing'
import type { LoadedTransitData } from './contracts/data'
import { createJourneyPlanningService } from './journey-planning'

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
    expect(routeEngine.routeWalking).toHaveBeenCalledTimes(3)
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
})
