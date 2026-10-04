import { describe, expect, it } from 'vitest'
import { reconcileRouteSelection } from './route-selection'
import { createTransitIndex } from '../domain/transit'
import { createValidTransitNetwork } from '../domain/transit/test-fixtures'

describe('reconcileRouteSelection', () => {
  it('keeps a replacement route and uses only its replacement overlaps', () => {
    const network = createValidTransitNetwork()
    network.routes.push({
      id: 'A2',
      name: 'A2',
      color: '#654321',
      stopIds: ['STOP-A', 'STOP-B'],
    })
    const index = createTransitIndex(network)

    const selection = reconcileRouteSelection(index, 'A1', new Map([
      ['A1', new Set(['A2', 'REMOVED'])],
    ]))

    expect(selection.route?.id).toBe('A1')
    expect(Array.from(selection.overlappingRouteIds)).toEqual(['A2'])
  })

  it('clears an application-owned route when the replacement index removes it', () => {
    const index = createTransitIndex(createValidTransitNetwork())

    const selection = reconcileRouteSelection(index, 'MISSING', new Map([
      ['MISSING', new Set(['A1'])],
    ]))

    expect(selection).toEqual({ route: null, overlappingRouteIds: new Set() })
  })
})
