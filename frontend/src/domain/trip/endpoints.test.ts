import { describe, expect, it } from 'vitest'
import {
  clearTripEndpoint,
  createEmptyTripRequest,
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
})
