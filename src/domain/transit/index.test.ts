import { describe, expect, it } from 'vitest'
import { createTransitNetworkIndex } from './index'
import { createValidTransitNetwork } from './test-fixtures'

describe('createTransitNetworkIndex', () => {
  it('indexes routes, stops, and membership in both directions', () => {
    const network = createValidTransitNetwork()
    const index = createTransitNetworkIndex(network)

    expect(index.routeById.get('A1')).toBe(network.routes[0])
    expect(index.stopById.get('STOP-A')).toBe(network.stops[0])
    expect(Array.from(index.stopIdsByRouteId.get('A1') ?? [])).toEqual(
      ['STOP-A', 'STOP-B'],
    )
    expect(Array.from(index.routeIdsByStopId.get('STOP-A') ?? [])).toEqual(['A1'])
  })

  it('does not expose mutable arrays as part of the index interface', () => {
    const index = createTransitNetworkIndex(createValidTransitNetwork())

    expect(index).not.toHaveProperty('routes')
    expect(index).not.toHaveProperty('stops')
  })
  it('does not expose mutating collection methods', () => {
    const index = createTransitNetworkIndex(createValidTransitNetwork())

    expect(index.routeById).not.toHaveProperty('set')
    expect(index.stopIdsByRouteId.get('A1')).not.toHaveProperty('add')
  })
})
