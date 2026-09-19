import { describe, expect, it } from 'vitest'
import { loadTransitMapData, loadVenueData, type JsonFetcher } from './loaders'

const network = {
  version: 1,
  metadata: {
    source: 'fixture',
    routeStopOrder: 'fixture',
    routeGeometry: 'fixture',
    verifiedAt: '2026-09-19',
    routeOrderSource: 'fixture',
    coordinateSource: 'fixture',
  },
  routes: [{
    id: 'R1',
    name: 'Route 1',
    color: '#123456',
    stopIds: ['A', 'B'],
  }],
  stops: [
    {
      id: 'A',
      longName: 'Stop A',
      shortName: 'A',
      latitude: 1,
      longitude: 103,
      services: ['R1'],
    },
    {
      id: 'B',
      longName: 'Stop B',
      shortName: 'B',
      latitude: 1.001,
      longitude: 103,
      services: ['R1'],
    },
  ],
}

const geometry = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { routeId: 'R1', name: 'Route 1', color: '#123456' },
    geometry: {
      type: 'LineString',
      coordinates: [[103, 1], [103, 1.001]],
    },
  }],
}

function createFetcher(payloads: Record<string, unknown>): JsonFetcher {
  return async (path) => {
    const payload = payloads[path]
    if (payload === undefined) throw new Error(`Missing fixture for ${path}`)
    return payload
  }
}

describe('loadVenueData', () => {
  it('validates before returning venue data and counts mappable venues', async () => {
    const venues = {
      COM1: { roomName: 'COM1', location: { x: 103.77, y: 1.29 } },
      UNKNOWN: { roomName: 'Unmapped' },
    }
    const result = await loadVenueData(
      new AbortController().signal,
      createFetcher({ 'data/venues.json': venues }),
    )

    expect(result.venues).toBe(venues)
    expect(result.venueCount).toBe(1)
  })

  it('rejects malformed venue data before returning it', async () => {
    await expect(loadVenueData(
      new AbortController().signal,
      createFetcher({ 'data/venues.json': { COM1: { roomName: '' } } }),
    )).rejects.toThrow(/Venue COM1 roomName/)
  })
})

describe('loadTransitMapData', () => {
  it('validates both payloads and builds the immutable lookup index', async () => {
    const result = await loadTransitMapData(
      new AbortController().signal,
      createFetcher({
        '/data/shuttle-network.json': network,
        '/data/shuttle-routes.geojson': geometry,
      }),
    )

    expect(result.network).toBe(network)
    expect(result.geometry).toBe(geometry)
    expect(result.index.routeById.get('R1')).toBe(network.routes[0])
    expect(result.index.stopById.get('B')).toBe(network.stops[1])
  })
})
