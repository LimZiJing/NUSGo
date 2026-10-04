import { describe, expect, it } from 'vitest'
import { createTransitIndex } from './index'
import { getReachableFavoriteStops } from './reachable-stops'
import { createValidTransitNetwork } from './test-fixtures'

describe('getReachableFavoriteStops', () => {
  function createReachabilityIndex() {
    const network = createValidTransitNetwork()
    network.routes[0].stopIds = ['STOP-A', 'STOP-B', 'STOP-C', 'STOP-D', 'STOP-E', 'STOP-A']
    network.stops.push(
      { id: 'STOP-C', longName: 'Stop C', shortName: 'C', latitude: 1.2, longitude: 103.2, services: ['A1'], opposite: null },
      { id: 'STOP-D', longName: 'Stop D', shortName: 'D', latitude: 1.3, longitude: 103.3, services: ['A1'], opposite: null },
      { id: 'STOP-E', longName: 'Stop E', shortName: 'E', latitude: 1.4, longitude: 103.4, services: ['A1'], opposite: null },
    )
    return createTransitIndex(network)
  }

  it('returns up to three favourite stops after the selected stop in route order', () => {
    const index = createReachabilityIndex()

    const result = getReachableFavoriteStops(
      index,
      'A1',
      'STOP-A',
      new Set(['STOP-E', 'STOP-C', 'STOP-D', 'STOP-B']),
    )

    expect(result.map(({ id }) => id)).toEqual(['STOP-B', 'STOP-C', 'STOP-D'])
  })

  it('does not wrap from the end of a route back to its beginning', () => {
    const result = getReachableFavoriteStops(
      createReachabilityIndex(),
      'A1',
      'STOP-D',
      new Set(['STOP-A', 'STOP-E']),
    )

    expect(result.map(({ id }) => id)).toEqual(['STOP-E'])
  })

  it('returns no stops when the route or selected stop is unknown', () => {
    const index = createReachabilityIndex()
    const favorites = new Set(['STOP-B'])

    expect(getReachableFavoriteStops(index, 'MISSING', 'STOP-A', favorites)).toEqual([])
    expect(getReachableFavoriteStops(index, 'A1', 'MISSING', favorites)).toEqual([])
  })
})
