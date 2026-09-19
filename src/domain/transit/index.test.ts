import { describe, expect, it } from 'vitest'
import { createTransitNetworkIndex } from './index'
import { createValidTransitNetwork } from './test-fixtures'

describe('createTransitNetworkIndex', () => {
  it('indexes routes, stops, and membership in both directions', () => {
    const network = createValidTransitNetwork()
    const index = createTransitNetworkIndex(network)

    expect(index.routeById.get('A1')).toBe(network.routes[0])
    expect(index.stopById.get('STOP-A')).toBe(network.stops[0])
    expect(index.stopIdsByRouteId.get('A1')).toEqual(
      new Set(['STOP-A', 'STOP-B']),
    )
    expect(index.routeIdsByStopId.get('STOP-A')).toEqual(new Set(['A1']))
  })

  it('does not expose mutable arrays as part of the index interface', () => {
    const index = createTransitNetworkIndex(createValidTransitNetwork())

    expect(index).not.toHaveProperty('routes')
    expect(index).not.toHaveProperty('stops')
  })
})
