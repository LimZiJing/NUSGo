import { describe, expect, it } from 'vitest'
import { createTransitIndex } from './index'
import { validateTransitNetwork } from './model'
import { createValidTransitNetwork } from './test-fixtures'

function createIndexedNetwork() {
  const network = createValidTransitNetwork()
  network.routes.push({
    id: 'B1',
    name: 'B1',
    color: '#654321',
    stopIds: ['STOP-A', 'STOP-B'],
  })
  return network
}

describe('createTransitIndex', () => {
  it('clones and freezes the network snapshots', () => {
    const source = createValidTransitNetwork()
    const index = createTransitIndex(source)

    expect(index.network).not.toBe(source)
    expect(index.routes[0]).not.toBe(source.routes[0])
    expect(index.stops[0]).not.toBe(source.stops[0])
    expect(Object.isFrozen(index)).toBe(true)
    expect(Object.isFrozen(index.network)).toBe(true)
    expect(Object.isFrozen(index.network.metadata)).toBe(true)
    expect(Object.isFrozen(index.routes)).toBe(true)
    expect(Object.isFrozen(index.stops)).toBe(true)
    expect(Object.isFrozen(index.routes[0])).toBe(true)
    expect(Object.isFrozen(index.routes[0].stopIds)).toBe(true)
    expect(Object.isFrozen(index.stops[0])).toBe(true)
    expect(Object.isFrozen(index.stops[0].services)).toBe(true)

    source.routes[0].name = 'Mutated source route'
    source.routes[0].stopIds[0] = 'CHANGED'
    source.stops[0].longName = 'Mutated source stop'

    expect(index.routeById.get('A1')?.name).toBe('A1')
    expect(index.routeById.get('A1')?.stopIds[0]).toBe('STOP-A')
    expect(index.stopById.get('STOP-A')?.longName).toBe('Stop A')
  })

  it('keeps validated snapshots deeply readonly at runtime', () => {
    const source = createValidTransitNetwork()
    const validated = validateTransitNetwork(source)

    expect(validated).not.toBe(source)
    expect(Object.isFrozen(validated)).toBe(true)
    expect(Object.isFrozen(validated.metadata)).toBe(true)
    expect(Object.isFrozen(validated.routes)).toBe(true)
    expect(Object.isFrozen(validated.routes[0])).toBe(true)
    expect(Object.isFrozen(validated.routes[0].stopIds)).toBe(true)
    expect(Object.isFrozen(validated.stops)).toBe(true)
    expect(Object.isFrozen(validated.stops[0])).toBe(true)
    expect(Object.isFrozen(validated.stops[0].services)).toBe(true)
    expect(() => {
      ;(validated.routes as unknown as Array<unknown>).push({})
    }).toThrow(TypeError)
  })

  it('exposes mutation-free map and set facades', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const routeById = index.routeById as unknown as Record<string, unknown>
    const membership = index.routeMembership.get('A1') as unknown as Record<string, unknown>

    expect(Object.isFrozen(index.routeById)).toBe(true)
    expect(Object.isFrozen(membership)).toBe(true)
    expect(routeById.set).toBeUndefined()
    expect(routeById.delete).toBeUndefined()
    expect(membership.add).toBeUndefined()
    expect(membership.delete).toBeUndefined()
    expect(index.routeById.get('A1')?.color).toBe('#123456')
  })

  it('rejects an unvalidated route with a missing stop deterministically', () => {
    const network = createValidTransitNetwork()
    network.routes[0].stopIds = ['STOP-A', 'MISSING']

    expect(() => createTransitIndex(network)).toThrowError(
      'Transit index route A1 references missing stop MISSING',
    )
  })

  it('supports forward and reverse route membership and ordered stop lookup', () => {
    const index = createTransitIndex(createIndexedNetwork())

    expect(index.routeById.has('B1')).toBe(true)
    expect(index.stopById.has('STOP-A')).toBe(true)
    expect(index.routeContainsStop('A1', 'STOP-A')).toBe(true)
    expect(index.routeContainsStop('A1', 'MISSING')).toBe(false)
    expect(Array.from(index.routeMembership.get('B1') ?? [])).toEqual(['STOP-A', 'STOP-B'])
    expect(Array.from(index.routeIdsByStopId.get('STOP-A') ?? [])).toEqual(['A1', 'B1'])
    expect(Array.from(index.routeIdsByStopId.get('STOP-B') ?? [])).toEqual(['A1', 'B1'])
    expect(index.routeStop('B1', 'STOP-B')?.longName).toBe('Stop B')
    expect(index.routeStop('A1', 'MISSING')).toBeUndefined()
    expect(index.routeStops('B1').map((stop) => stop.id)).toEqual(['STOP-A', 'STOP-B'])
    expect(index.routeStops('MISSING')).toEqual([])
  })
})
