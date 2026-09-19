import { describe, expect, it } from 'vitest'
import {
  TransitValidationError,
  validateTransitNetwork,
  validateTransitVerificationManifest,
} from './model'
import { createValidTransitNetwork } from './test-fixtures'
import type { TransitNetworkInput } from './types'

type Mutation = (network: TransitNetworkInput) => void
type ValidationCase = [name: string, mutate: Mutation, expected: RegExp]

const invalidCases: ValidationCase[] = [
  ['duplicate route IDs', (network) => network.routes.push({ ...network.routes[0] }), /Duplicate transit route ID: A1/],
  ['duplicate stop IDs', (network) => network.stops.push({ ...network.stops[0] }), /Duplicate transit stop ID: STOP-A/],
  ['route with fewer than two stops', (network) => { network.routes[0].stopIds = ['STOP-A'] }, /Transit route A1 must contain at least two stops/],
  ['repeated stop in a route', (network) => { network.routes[0].stopIds = ['STOP-A', 'STOP-A'] }, /Transit route A1 repeats stop: STOP-A/],
  ['unknown route stop reference', (network) => { network.routes[0].stopIds = ['STOP-A', 'MISSING'] }, /Transit route A1 references unknown stop: MISSING/],
  ['non-finite latitude', (network) => { network.stops[0].latitude = Number.NaN }, /Transit stop STOP-A has invalid latitude: NaN/],
  ['out-of-range longitude', (network) => { network.stops[0].longitude = 181 }, /Transit stop STOP-A has invalid longitude: 181/],
  ['non-hex route color', (network) => { network.routes[0].color = 'blue' }, /Transit route A1 has non-hex route color: blue/],
  ['non-reciprocal opposite reference', (network) => { network.stops[1].opposite = null }, /Transit stop STOP-A opposite reference is not reciprocal with STOP-B/],
  ['unknown internal route service', (network) => { network.stops[0].services.push('LOCAL-UNKNOWN') }, /Transit stop STOP-A references unknown internal route service: LOCAL-UNKNOWN/],
]

describe('validateTransitNetwork', () => {
  it('accepts a valid network and opaque public services', () => {
    const network = createValidTransitNetwork()
    network.stops[0].services.push('PUB:999')

    expect(validateTransitNetwork(network)).toEqual(network)
  })

  for (const [name, mutate, expected] of invalidCases) {
    it(`rejects ${name}`, () => {
      const network = createValidTransitNetwork()
      mutate(network)

      expect(() => validateTransitNetwork(network)).toThrowError(expected)
    })
  }

  it('reports all validation issues in deterministic order', () => {
    const network = createValidTransitNetwork()
    network.routes[0].color = 'blue'
    network.stops[0].latitude = Number.POSITIVE_INFINITY

    let error: unknown
    try {
      validateTransitNetwork(network)
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(TransitValidationError)
    expect((error as TransitValidationError).issues).toEqual([
      'Transit stop STOP-A has invalid latitude: Infinity',
      'Transit route A1 has non-hex route color: blue',
    ])
  })

describe('deterministic malformed field reporting', () => {
  it('identifies metadata, route, stop, service, and opposite field failures', () => {
    const network = createValidTransitNetwork()
    network.version = 2
    network.metadata.source = ''
    network.routes[0].id = ' '
    network.routes[0].name = ''
    network.routes[0].stopIds = ['STOP-A', ' ']
    network.stops[0].id = ' '
    network.stops[0].longName = ''
    network.stops[0].shortName = ''
    network.stops[0].services = ['A1', 'A1']
    network.stops[0].opposite = 42 as unknown as string

    let error: unknown
    try {
      validateTransitNetwork(network)
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(TransitValidationError)
    expect((error as TransitValidationError).issues).toEqual([
      'Transit network version must be 1: 2',
      'Transit network metadata source must be a non-empty string',
      'Transit route <index 0> must have a non-empty ID',
      'Transit stop <index 0> must have a non-empty ID',
      'Transit stop <index 0> longName must be a non-empty string',
      'Transit stop <index 0> shortName must be a non-empty string',
      'Transit stop <index 0> references unknown internal route service: A1',
      'Transit stop <index 0> repeats service: A1',
      'Transit stop <index 0> references unknown internal route service: A1',
      'Transit stop STOP-B references unknown internal route service: A1',
      'Transit route <index 0> name must be a non-empty string',
      'Transit route <index 0> references unknown stop: STOP-A',
      'Transit route <index 0> has an invalid stop ID:  ',
      'Transit stop <index 0> has an invalid opposite stop reference: 42',
      'Transit stop STOP-B references unknown opposite stop: STOP-A',
    ])
  })
})
})

describe('validateTransitVerificationManifest', () => {
  it('accepts a manifest whose route order matches the network', () => {
    const network = createValidTransitNetwork()
    const manifest = {
      version: 1,
      reviewedAt: '2026-09-17',
      routeOrderSource: 'test route source',
      coordinateSource: 'test coordinate source',
      geometry: {
        source: 'test geometry source',
        reviewedAt: '2026-09-17',
        reviewNotes: 'test geometry review',
      },
      routes: [{
        routeId: 'A1',
        direction: 'Stop A to Stop B',
        orderedStopIds: ['STOP-A', 'STOP-B'],
      }],
    }

    expect(validateTransitVerificationManifest(network, manifest)).toBe(manifest)
  })

  it('rejects malformed manifest route fields with deterministic identifiers', () => {
    const network = createValidTransitNetwork()
    const manifest = {
      version: 1,
      reviewedAt: '2026-09-17',
      routeOrderSource: 'test route source',
      coordinateSource: 'test coordinate source',
      geometry: {
        source: 'test geometry source',
        reviewedAt: '2026-09-17',
        reviewNotes: 'test geometry review',
      },
      routes: [{
        routeId: 'A1',
        direction: '',
        orderedStopIds: ['STOP-A', 42],
      }],
    }

    expect(() => validateTransitVerificationManifest(network, manifest)).toThrowError(
      /Transit verification route A1 direction must be a non-empty string/,
    )
    expect(() => validateTransitVerificationManifest(network, manifest)).toThrowError(
      /Transit verification route A1 ordered stop 1 must be a non-empty string/,
    )
  })

  it('rejects manifest route-order drift with the route ID', () => {
    const network = createValidTransitNetwork()
    const manifest = {
      version: 1,
      reviewedAt: '2026-09-17',
      routeOrderSource: 'test route source',
      coordinateSource: 'test coordinate source',
      geometry: {
        source: 'test geometry source',
        reviewedAt: '2026-09-17',
        reviewNotes: 'test geometry review',
      },
      routes: [{
        routeId: 'A1',
        direction: 'Stop A to Stop B',
        orderedStopIds: ['STOP-B', 'STOP-A'],
      }],
    }

    expect(() => validateTransitVerificationManifest(network, manifest)).toThrowError(
      /Transit verification route A1 stop order does not match the network model/,
    )
  })
})
