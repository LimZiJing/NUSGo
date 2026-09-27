import { describe, expect, it } from 'vitest'
import { createTransitIndex } from '../../domain/transit'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'
import { getMobileStopsOverview } from './mobile-stops-overview'

function createOverviewIndex() {
  const network = createValidTransitNetwork()
  network.stops.push(
    { id: 'STOP-C', longName: 'Zulu', shortName: 'Zulu', latitude: 1.006, longitude: 103, services: ['A1'] },
    { id: 'STOP-D', longName: 'Alpha', shortName: 'Alpha', latitude: 1.004, longitude: 103, services: ['A1'] },
  )
  return createTransitIndex(network)
}

describe('mobile Stops overview', () => {
  it('filters by map centre and orders nearby stops by map distance', () => {
    const index = createOverviewIndex()
    const centre = { longitude: 103, latitude: 1 }
    const nearby = getMobileStopsOverview(index, 'nearby', centre, null, [])

    expect(nearby.map(({ stop }) => stop.id)).toEqual(['STOP-A', 'STOP-D', 'STOP-C'])
    expect(nearby.every(({ distanceMeters }) => distanceMeters === null)).toBe(true)
    expect(getMobileStopsOverview(index, 'nearby', { longitude: 103.1, latitude: 1.1 }, null, [])
      .map(({ stop }) => stop.id)).toEqual(['STOP-B'])
  })

  it('keeps map-centre ordering when a device fix supplies distance badges', () => {
    const nearby = getMobileStopsOverview(
      createOverviewIndex(),
      'nearby',
      { longitude: 103, latitude: 1 },
      { longitude: 103.1, latitude: 1.1, accuracy: 10, timestamp: 1 },
      [],
    )

    expect(nearby.map(({ stop }) => stop.id)).toEqual(['STOP-A', 'STOP-D', 'STOP-C'])
    expect(nearby.every(({ distanceMeters }) => distanceMeters !== null)).toBe(true)
  })

  it('shows every saved canonical stop alphabetically regardless of map radius', () => {
    const favourites = getMobileStopsOverview(
      createOverviewIndex(),
      'favourites',
      { longitude: 103, latitude: 1 },
      null,
      ['STOP-C', 'STOP-B', 'missing'],
    )

    expect(favourites.map(({ stop }) => stop.id)).toEqual(['STOP-B', 'STOP-C'])
    expect(getMobileStopsOverview(null, 'nearby', null, null, [])).toEqual([])
  })
})
