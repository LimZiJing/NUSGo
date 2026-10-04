import { describe, expect, it, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import type { Journey } from '../../domain/trip/journey'
import { createTransitIndex } from '../../domain/transit'
import {
  createTransferTransitNetwork,
  createValidTransitNetwork,
} from '../../domain/transit/test-fixtures'
import {
  createJourneyRouteLayers,
  JOURNEY_ROUTE_SOURCE_ID,
  JOURNEY_ROUTE_CASING_LAYER_ID,
  JOURNEY_SHUTTLE_LAYER_ID,
  JOURNEY_WALKING_LAYER_ID,
} from './journey'

function createFakeMap(failingLayerId?: string): {
  readonly map: Map
  readonly sources: globalThis.Map<string, unknown>
  readonly layers: Set<string>
  readonly addedSources: Array<{ id: string; source: unknown }>
  readonly addedLayers: Array<{ id: string }>
  readonly removedSources: string[]
  readonly removedLayers: string[]
} {
  const sources = new globalThis.Map<string, unknown>()
  const layers = new Set<string>()
  const addedSources: Array<{ id: string; source: unknown }> = []
  const addedLayers: Array<{ id: string }> = []
  const removedSources: string[] = []
  const removedLayers: string[] = []
  const map = {
    getSource: vi.fn((id: string) => sources.get(id)),
    getLayer: vi.fn((id: string) => layers.has(id) ? {} : undefined),
    addSource: vi.fn((id: string, source: unknown) => {
      sources.set(id, source)
      addedSources.push({ id, source })
    }),
    addLayer: vi.fn((layer: { id: string }) => {
      if (layer.id === failingLayerId) throw new Error(`Unable to add ${layer.id}`)
      layers.add(layer.id)
      addedLayers.push(layer)
    }),
    removeSource: vi.fn((id: string) => {
      sources.delete(id)
      removedSources.push(id)
    }),
    removeLayer: vi.fn((id: string) => {
      layers.delete(id)
      removedLayers.push(id)
    }),
  } as unknown as Map

  return { map, sources, layers, addedSources, addedLayers, removedSources, removedLayers }
}

function createJourney(routeId: string): Journey {
  return {
    origin: { kind: 'venue', id: 'ORIGIN' },
    destination: { kind: 'venue', id: 'DESTINATION' },
    legs: [
      {
        mode: 'walking',
        from: { kind: 'venue', id: 'ORIGIN' },
        to: { kind: 'stop', id: 'STOP-A' },
        durationSeconds: 60,
        distanceMeters: 80,
        geometry: { type: 'LineString', coordinates: [[103, 1], [103.01, 1.01]] },
      },
      {
        mode: 'shuttle',
        from: { kind: 'stop', id: 'STOP-A' },
        to: { kind: 'stop', id: 'STOP-B' },
        durationSeconds: 120,
        distanceMeters: 900,
        geometry: { type: 'LineString', coordinates: [[103.01, 1.01], [103.1, 1.1]] },
        routeId,
        boardingStopId: 'STOP-A',
        alightingStopId: 'STOP-B',
        waitingSeconds: 0,
        rideSeconds: 120,
      },
    ],
    totalDurationSeconds: 180,
    totalDistanceMeters: 980,
    estimateStatus: 'estimated',
    planningQuality: 'exact',
  }
}

describe('journey route layer adapter', () => {
  it('renders each Journey leg with mode metadata and cleans up replacements and clears', () => {
    const state = createFakeMap()
    const index = createTransitIndex(createValidTransitNetwork())
    const layers = createJourneyRouteLayers(state.map, index)

    layers.setJourney(createJourney('A1'))

    expect(state.addedSources).toHaveLength(1)
    expect(state.addedLayers.map(({ id }) => id)).toEqual([
      JOURNEY_ROUTE_CASING_LAYER_ID,
      JOURNEY_WALKING_LAYER_ID,
      JOURNEY_SHUTTLE_LAYER_ID,
    ])
    expect(state.sources.has(JOURNEY_ROUTE_SOURCE_ID)).toBe(true)
    expect((state.addedSources[0].source as { data: { features: unknown[] } }).data.features)
      .toMatchObject([
        { properties: { legIndex: 0, mode: 'walking', routeId: null } },
        { properties: { legIndex: 1, mode: 'shuttle', routeId: 'A1', routeColor: '#123456' } },
      ])
    expect(state.addedLayers[2]).toMatchObject({
      id: JOURNEY_SHUTTLE_LAYER_ID,
      paint: { 'line-color': ['coalesce', ['get', 'routeColor'], '#d97706'] },
    })
    expect(state.addedLayers[1]).toMatchObject({
      paint: { 'line-color': '#2563eb' },
    })

    layers.setJourney(createJourney('B1'))
    expect(state.removedLayers).toEqual([
      JOURNEY_SHUTTLE_LAYER_ID,
      JOURNEY_WALKING_LAYER_ID,
      JOURNEY_ROUTE_CASING_LAYER_ID,
    ])
    expect(state.removedSources).toEqual([JOURNEY_ROUTE_SOURCE_ID])

    layers.setJourney(null)
    expect(state.removedLayers).toHaveLength(6)
    expect(state.removedSources).toEqual([
      JOURNEY_ROUTE_SOURCE_ID,
      JOURNEY_ROUTE_SOURCE_ID,
    ])

    layers.dispose()
    layers.dispose()
    layers.setJourney(createJourney('C1'))
    expect(state.addedSources).toHaveLength(2)
    expect(state.removedLayers).toHaveLength(6)
  })

  it('uses each canonical route color for shuttle legs in a Journey', () => {
    const index = createTransitIndex(createTransferTransitNetwork())
    const state = createFakeMap()
    const layers = createJourneyRouteLayers(state.map, index)
    const journey: Journey = {
      origin: { kind: 'stop', id: 'STOP-A' },
      destination: { kind: 'stop', id: 'STOP-C' },
      legs: [
        {
          mode: 'shuttle',
          from: { kind: 'stop', id: 'STOP-A' },
          to: { kind: 'stop', id: 'STOP-B' },
          durationSeconds: 120,
          distanceMeters: 900,
          geometry: { type: 'LineString', coordinates: [[103, 1], [103.1, 1.1]] },
          routeId: 'A1',
          boardingStopId: 'STOP-A',
          alightingStopId: 'STOP-B',
          waitingSeconds: 0,
          rideSeconds: 120,
        },
        {
          mode: 'shuttle',
          from: { kind: 'stop', id: 'STOP-B' },
          to: { kind: 'stop', id: 'STOP-C' },
          durationSeconds: 180,
          distanceMeters: 1000,
          geometry: { type: 'LineString', coordinates: [[103.1, 1.1], [103.2, 1.2]] },
          routeId: 'B1',
          boardingStopId: 'STOP-B',
          alightingStopId: 'STOP-C',
          waitingSeconds: 0,
          rideSeconds: 180,
        },
      ],
      totalDurationSeconds: 300,
      totalDistanceMeters: 1900,
      estimateStatus: 'estimated',
      planningQuality: 'exact',
    }

    layers.setJourney(journey)

    expect((state.addedSources[0].source as { data: { features: Array<{ properties: unknown }> } }).data.features)
      .toMatchObject([
        { properties: { routeId: 'A1', routeColor: '#123456' } },
        { properties: { routeId: 'B1', routeColor: '#654321' } },
      ])
  })

  it('cleans up a partial installation when a layer cannot be added', () => {
    const state = createFakeMap(JOURNEY_WALKING_LAYER_ID)
    const layers = createJourneyRouteLayers(state.map, null)

    expect(() => layers.setJourney(createJourney('A1')))
      .toThrow('Unable to add journey-walking-lines')
    expect(state.sources.size).toBe(0)
    expect(state.layers.size).toBe(0)
    expect(state.removedLayers).toEqual([JOURNEY_ROUTE_CASING_LAYER_ID])
    expect(state.removedSources).toEqual([JOURNEY_ROUTE_SOURCE_ID])
  })
})
