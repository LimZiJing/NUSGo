import { describe, expect, it } from 'vitest'
import { createTransitIndex } from '../domain/transit'
import { createValidTransitNetwork } from '../domain/transit/test-fixtures'
import type { VenueSearchResult } from '../domain/venue/search'
import {
  calculateMapOverlayInsets,
  getResetTarget,
  type MapOverlayMeasurements,
  type ResetTargetContext,
} from './map-camera'

function measurements(overrides: Partial<MapOverlayMeasurements> = {}): MapOverlayMeasurements {
  return {
    viewportWidth: 390,
    viewportHeight: 844,
    tripCardHeight: 76,
    contextualSheetHeight: 184,
    tripCardVisible: true,
    contextualSheetVisible: true,
    desktopNavigationWidth: 0,
    ...overrides,
  }
}

function createContext(overrides: Partial<ResetTargetContext> = {}): ResetTargetContext {
  const network = createValidTransitNetwork()
  return {
    panelMode: 'venue-search',
    selectedVenue: null,
    selectedRouteId: null,
    tripRequest: { origin: null, destination: null },
    venues: {
      COM1: { roomName: 'Computing 1', location: { x: 103.7, y: 1.3 } },
    },
    transitIndex: createTransitIndex(network),
    ...overrides,
  }
}

const venueResult: VenueSearchResult = {
  code: 'COM1',
  venue: {
    roomName: 'Computing 1',
    location: { x: 103.7, y: 1.3 },
  },
}

describe('map camera application seams', () => {
  it('calculates portrait insets from the measured mobile surfaces', () => {
    expect(calculateMapOverlayInsets(measurements())).toEqual({
      top: 88,
      right: 12,
      bottom: 196,
      left: 12,
    })
  })

  it('keeps a usable map gap in short landscape while accounting for both surfaces', () => {
    expect(calculateMapOverlayInsets(measurements({
      viewportWidth: 568,
      viewportHeight: 320,
      tripCardHeight: 72,
      contextualSheetHeight: 150,
    }))).toEqual({
      top: 84,
      right: 12,
      bottom: 162,
      left: 12,
    })
  })

  it('prioritizes the currently visible venue detail over retained route and endpoints', () => {
    expect(getResetTarget(createContext({
      panelMode: 'venue-detail',
      selectedVenue: venueResult,
      selectedRouteId: 'A1',
      tripRequest: {
        origin: { kind: 'venue', id: 'COM1' },
        destination: { kind: 'stop', id: 'STOP-A' },
      },
    }))).toEqual({
      kind: 'venue',
      center: [103.7, 1.3],
      zoom: 17,
    })
  })

  it('prioritizes the currently visible selected shuttle route over endpoints', () => {
    expect(getResetTarget(createContext({
      panelMode: 'shuttle',
      selectedRouteId: 'A1',
      tripRequest: { origin: { kind: 'venue', id: 'COM1' }, destination: null },
    }))).toEqual({ kind: 'route', routeId: 'A1' })
  })

  it('fits available endpoint coordinates before retaining a route', () => {
    expect(getResetTarget(createContext({
      selectedRouteId: 'A1',
      tripRequest: {
        origin: { kind: 'venue', id: 'COM1' },
        destination: { kind: 'stop', id: 'STOP-A' },
      },
    }))).toEqual({
      kind: 'trip',
      coordinates: [[103.7, 1.3], [103, 1]],
    })
  })

  it('falls back to the retained route and then campus when no endpoint is available', () => {
    expect(getResetTarget(createContext({ selectedRouteId: 'A1' }))).toEqual({
      kind: 'route',
      routeId: 'A1',
    })
    expect(getResetTarget(createContext())).toEqual({
      kind: 'campus',
      center: [103.7844, 1.2933],
      zoom: 15,
    })
  })
})
