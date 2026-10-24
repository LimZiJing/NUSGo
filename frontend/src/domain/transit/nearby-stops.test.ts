import { describe, expect, it } from 'vitest'
import { createTransitIndex } from './index'
import { findNearbyShuttleStops } from './nearby-stops'
import type { TransitNetworkInput } from '@nusgo/shared/transit/types'

const earthRadiusMeters = 6_371_008.8
const latitudeOffsetForMeters = (distance: number): number => (
  distance / earthRadiusMeters * (180 / Math.PI)
)

function createNearbyStopsNetwork(): TransitNetworkInput {
  return {
    version: 1,
    metadata: {
      source: 'test source',
      routeStopOrder: 'test order',
      routeGeometry: 'not included',
      verifiedAt: '2026-09-26',
      routeOrderSource: 'test route source',
      coordinateSource: 'test coordinate source',
    },
    routes: [
      { id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-400', 'STOP-100', 'STOP-300', 'STOP-501'] },
      { id: 'B1', name: 'B1', color: '#fbbf24', stopIds: ['STOP-200'] },
    ],
    stops: [
      { id: 'STOP-400', longName: 'Two Hundred Forty Metres', shortName: '240 m', latitude: latitudeOffsetForMeters(240), longitude: 103, services: ['A1', 'PUB:95'] },
      { id: 'STOP-100', longName: 'One Hundred Metres', shortName: '100 m', latitude: latitudeOffsetForMeters(100), longitude: 103, services: ['A1', 'PUB:95'] },
      { id: 'STOP-300', longName: 'Two Hundred Twenty Metres', shortName: '220 m', latitude: latitudeOffsetForMeters(220), longitude: 103, services: ['A1'] },
      { id: 'STOP-200', longName: 'Two Hundred Metres', shortName: '200 m', latitude: latitudeOffsetForMeters(200), longitude: 103, services: ['B1', 'PUB:95'] },
      { id: 'STOP-501', longName: 'Outside Range', shortName: '251 m', latitude: latitudeOffsetForMeters(251), longitude: 103, services: ['A1'] },
      { id: 'PUBLIC-ONLY', longName: 'Public Bus Stop', shortName: 'Public', latitude: 0, longitude: 103, services: ['PUB:95'] },
    ],
  }
}

describe('findNearbyShuttleStops', () => {
  const index = createTransitIndex(createNearbyStopsNetwork())
  const venue = { x: 103, y: 0 }

  it('includes a stop at 250 metres and excludes a stop outside the radius', () => {
    const network = createNearbyStopsNetwork()
    network.routes = [{ id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-250', 'STOP-251'] }]
    network.stops = [
      { id: 'STOP-250', longName: 'Boundary', shortName: 'Boundary', latitude: latitudeOffsetForMeters(250), longitude: 103, services: ['A1'] },
      { id: 'STOP-251', longName: 'Outside', shortName: 'Outside', latitude: latitudeOffsetForMeters(250.1), longitude: 103, services: ['A1'] },
    ]

    expect(findNearbyShuttleStops(venue, createTransitIndex(network)).map(({ stop }) => stop.id))
      .toEqual(['STOP-250'])
  })

  it('returns the nearest three qualifying stops first with route metadata only', () => {
    const nearbyStops = findNearbyShuttleStops(venue, index)

    expect(nearbyStops.map(({ stop }) => stop.id)).toEqual([
      'STOP-100',
      'STOP-200',
      'STOP-300',
    ])
    expect(nearbyStops.map(({ services }) => services.map(({ id, color }) => [id, color]))).toEqual([
      [['A1', '#123456']],
      [['B1', '#fbbf24']],
      [['A1', '#123456']],
    ])
  })

  it('returns no nearby stops when coordinates are missing or no bus stop qualifies', () => {
    expect(findNearbyShuttleStops(undefined, index)).toEqual([])
    expect(findNearbyShuttleStops({ x: 103, y: 1 }, index)).toEqual([])
  })
})
