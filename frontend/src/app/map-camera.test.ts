import { describe, expect, it } from 'vitest'
import { buildBuildingIndex } from '../domain/venue/building-index'
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
    activeSheetHeight: 184,
    tripCardVisible: true,
    activeSheetVisible: true,
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
      activeSheetHeight: 150,
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

  it('prioritizes the frozen Current location trip over retained venue and route context', () => {
    expect(getResetTarget(createContext({
      panelMode: 'shuttle',
      selectedVenue: venueResult,
      selectedRouteId: 'A1',
      tripRequest: {
        origin: {
          kind: 'current-location',
          coordinate: { longitude: 103.7844, latitude: 1.2933 },
        },
        destination: { kind: 'venue', id: 'COM1' },
      },
    }))).toEqual({
      kind: 'trip',
      coordinates: [[103.7844, 1.2933], [103.7, 1.3]],
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

  it('fits a building endpoint at its own location, apart from the stop beside it', () => {
    const buildings = buildBuildingIndex([{
      id: 'com3',
      name: 'COM3',
      aliases: [],
      elementId: 'way/1',
      location: { x: 103.775, y: 1.295 },
      roomCodePrefixes: [],
      sourceRefs: [],
    }])

    expect(getResetTarget(createContext({
      buildings,
      tripRequest: {
        origin: { kind: 'building', id: 'com3' },
        destination: { kind: 'stop', id: 'STOP-A' },
      },
    }))).toEqual({
      kind: 'trip',
      coordinates: [[103.775, 1.295], [103, 1]],
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
