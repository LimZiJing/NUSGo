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
})
