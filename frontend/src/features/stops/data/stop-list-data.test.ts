import { describe, expect, it } from 'vitest'
import { createTransitIndex } from '../../../domain/transit'
import { createValidTransitNetwork } from '../../../domain/transit/test-fixtures'
import {
  getStopsForList,
  getStopsWithinNearbyRadius,
  NEARBY_STOP_RADIUS_METERS,
} from './stop-list-data'

function createOverviewIndex() {
  const network = createValidTransitNetwork()
  network.stops.push(
    { id: 'STOP-C', longName: 'Zulu', shortName: 'Zulu', latitude: 1.0006, longitude: 103, services: ['A1'] },
    { id: 'STOP-D', longName: 'Alpha', shortName: 'Alpha', latitude: 1.0004, longitude: 103, services: ['A1'] },
  )
  return createTransitIndex(network)
}

describe('Stops list data', () => {
  it('uses a 250 metre Nearby expansion radius', () => {
    expect(NEARBY_STOP_RADIUS_METERS).toBe(250)
  })

  it('shows all stops and orders the Nearby list by map distance', () => {
    const index = createOverviewIndex()
    const centre = { longitude: 103, latitude: 1 }
    const nearby = getStopsForList(index, 'nearby', centre, null, [])

    expect(nearby.map(({ stop }) => stop.id)).toEqual(['STOP-A', 'STOP-D', 'STOP-C', 'STOP-B'])
    expect(nearby.every(({ distanceMeters }) => distanceMeters === null)).toBe(true)
    expect(getStopsForList(index, 'nearby', { longitude: 103.1, latitude: 1.1 }, null, [])
      .map(({ stop }) => stop.id)).toEqual(['STOP-B', 'STOP-C', 'STOP-D', 'STOP-A'])

    expect(getStopsWithinNearbyRadius(index, centre)
      .map(({ stop }) => stop.id)).toEqual(['STOP-A', 'STOP-D', 'STOP-C'])
    expect(getStopsWithinNearbyRadius(index, { longitude: 103.1, latitude: 1.1 })
      .map(({ stop }) => stop.id)).toEqual(['STOP-B'])
  })

  it('keeps map-centre ordering when a device fix supplies distance badges', () => {
    const nearby = getStopsForList(
      createOverviewIndex(),
      'nearby',
      { longitude: 103, latitude: 1 },
      { longitude: 103.1, latitude: 1.1, accuracy: 10, timestamp: 1 },
      [],
    )

    expect(nearby.map(({ stop }) => stop.id)).toEqual(['STOP-A', 'STOP-D', 'STOP-C', 'STOP-B'])
    expect(nearby.every(({ distanceMeters }) => distanceMeters !== null)).toBe(true)
  })

  it('includes stops at or just inside the Nearby expansion radius and excludes one just beyond it', () => {
    const centre = { longitude: 103, latitude: 0 }
    const latitudeOffset = (distanceMeters: number): number => (
      distanceMeters / 6_371_008.8 * 180 / Math.PI
    )
    const network = createValidTransitNetwork()
    network.stops.push(
      {
        id: 'STOP-INSIDE-RADIUS',
        longName: 'Inside radius',
        shortName: 'Inside radius',
        latitude: centre.latitude + latitudeOffset(NEARBY_STOP_RADIUS_METERS - 0.01),
        longitude: centre.longitude,
        services: ['A1'],
        opposite: null,
      },
      {
        id: 'STOP-ON-RADIUS',
        longName: 'On radius',
        shortName: 'On radius',
        latitude: centre.latitude + latitudeOffset(NEARBY_STOP_RADIUS_METERS),
        longitude: centre.longitude,
        services: ['A1'],
        opposite: null,
      },
      {
        id: 'STOP-BEYOND-RADIUS',
        longName: 'Beyond radius',
        shortName: 'Beyond radius',
        latitude: centre.latitude + latitudeOffset(NEARBY_STOP_RADIUS_METERS + 1),
        longitude: centre.longitude,
        services: ['A1'],
        opposite: null,
      },
    )
    const nearbyStopIds = getStopsWithinNearbyRadius(createTransitIndex(network), centre)
      .map(({ stop }) => stop.id)

    expect(nearbyStopIds).toContain('STOP-INSIDE-RADIUS')
    expect(nearbyStopIds).toContain('STOP-ON-RADIUS')
    expect(nearbyStopIds).not.toContain('STOP-BEYOND-RADIUS')
  })

  it('shows every saved canonical stop alphabetically regardless of map radius', () => {
    const favourites = getStopsForList(
      createOverviewIndex(),
      'favourites',
      { longitude: 103, latitude: 1 },
      null,
      ['STOP-C', 'STOP-B', 'missing'],
    )

    expect(favourites.map(({ stop }) => stop.id)).toEqual(['STOP-B', 'STOP-C'])
    expect(getStopsForList(null, 'nearby', null, null, [])).toEqual([])
  })
})
