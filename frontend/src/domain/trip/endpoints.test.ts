import { describe, expect, it } from 'vitest'
import {
  clearTripEndpoint,
  createCurrentLocationTripEndpoint,
  createEmptyTripRequest,
  getTripEndpointKey,
  setTripEndpoint,
  swapTripEndpoints,
  validateTripRequest,
} from './endpoints'
import type { TripEndpoint, TripRequest } from './types'

const venue: TripEndpoint = { kind: 'venue', id: 'LT17' }
const stop: TripEndpoint = { kind: 'stop', id: 'STOP-A' }

describe('trip endpoint state', () => {
  it('creates an empty trip request', () => {
    expect(createEmptyTripRequest()).toEqual({
      origin: null,
      destination: null,
    })
  })

  it('assigns an endpoint without mutating the request', () => {
    const request = createEmptyTripRequest()

    expect(setTripEndpoint(request, 'origin', venue)).toEqual({
      origin: venue,
      destination: null,
    })
    expect(request).toEqual({ origin: null, destination: null })
  })

  it('clears one endpoint without changing the other', () => {
    const request: TripRequest = { origin: venue, destination: stop }

    expect(clearTripEndpoint(request, 'origin')).toEqual({
      origin: null,
      destination: stop,
    })
    expect(request).toEqual({ origin: venue, destination: stop })
  })

  it('swaps origin and destination without mutating the request', () => {
    const request: TripRequest = { origin: venue, destination: stop }

    expect(swapTripEndpoints(request)).toEqual({
      origin: stop,
      destination: venue,
    })
    expect(request).toEqual({ origin: venue, destination: stop })
  })

  it('creates an immutable Current location endpoint only from valid coordinates', () => {
    const endpoint = createCurrentLocationTripEndpoint({ longitude: 103.78, latitude: 1.29 })

    expect(endpoint).toEqual({
      kind: 'current-location',
      coordinate: { longitude: 103.78, latitude: 1.29 },
    })
    expect(Object.isFrozen(endpoint)).toBe(true)
    expect(Object.isFrozen(endpoint?.coordinate)).toBe(true)
    expect(createCurrentLocationTripEndpoint({ longitude: 181, latitude: 1 })).toBeNull()
    expect(createCurrentLocationTripEndpoint({ longitude: 103, latitude: Number.NaN })).toBeNull()
    expect(createCurrentLocationTripEndpoint(null)).toBeNull()
  })

  it('uses frozen coordinates as the Current location identity', () => {
    const first = createCurrentLocationTripEndpoint({ longitude: 103.78, latitude: 1.29 })!
    const same = createCurrentLocationTripEndpoint({ longitude: 103.78, latitude: 1.29 })!
    const different = createCurrentLocationTripEndpoint({ longitude: 103.79, latitude: 1.29 })!

    expect(getTripEndpointKey(first)).toBe(getTripEndpointKey(same))
    expect(getTripEndpointKey(first)).not.toBe(getTripEndpointKey(different))
  })
})

describe('validateTripRequest', () => {
  it('reports a missing origin and destination', () => {
    expect(validateTripRequest(createEmptyTripRequest())).toBe('Origin is required.')
    expect(validateTripRequest({ origin: venue, destination: null })).toBe('Destination is required.')
  })

  it('reports incomplete endpoint selections', () => {
    const request = {
      origin: { kind: 'venue', id: '  ' },
      destination: stop,
    } as TripRequest

    expect(validateTripRequest(request)).toBe('Origin selection is incomplete.')
  })

  it('reports identical origin and destination selections', () => {
    const request: TripRequest = {
      origin: venue,
      destination: { kind: 'venue', id: 'LT17' },
    }

    expect(validateTripRequest(request)).toBe(
      'Origin and destination must be different locations.',
    )
  })

  it('accepts two complete, different endpoints', () => {
    expect(validateTripRequest({ origin: venue, destination: stop })).toBeNull()
  })

  it('validates Current location coordinates and rejects identical snapshots', () => {
    const currentLocation = createCurrentLocationTripEndpoint({ longitude: 103.78, latitude: 1.29 })!
    const sameCurrentLocation = createCurrentLocationTripEndpoint({ longitude: 103.78, latitude: 1.29 })!
    const invalidCurrentLocation = {
      kind: 'current-location',
      coordinate: { longitude: 181, latitude: 1 },
    } as TripEndpoint

    expect(validateTripRequest({ origin: currentLocation, destination: stop })).toBeNull()
    expect(validateTripRequest({ origin: currentLocation, destination: sameCurrentLocation })).toBe(
      'Origin and destination must be different locations.',
    )
    expect(validateTripRequest({ origin: invalidCurrentLocation, destination: stop })).toBe(
      'Origin selection is incomplete.',
    )
  })
})
