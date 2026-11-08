import { describe, expect, it } from 'vitest'
import type { TransitNetwork } from '@nusgo/shared/transit/types'
import { createTransitIndex } from './index'
import {
  findNearbyBusStopSuggestion,
  findRouteStopSuggestion,
  getRouteStartIndex,
  isAtBusStop,
  isRouteFollowFixUsable,
} from './route-following'

const now = 1_000_000
const metadata = {
  source: 'test',
  routeStopOrder: 'test order',
  routeGeometry: 'not included',
  verifiedAt: '2026-01-01',
  routeOrderSource: 'test route source',
  coordinateSource: 'test coordinate source',
}
const fix = {
  longitude: 103.78,
  latitude: 1.29,
  accuracy: 10,
  timestamp: now,
}

function longitudeOffsetForMeters(meters: number): number {
  return meters / 111_320 / Math.cos(1.29 * Math.PI / 180)
}

function createIndex(): ReturnType<typeof createTransitIndex> {
  const network: TransitNetwork = {
    version: 1,
    metadata,
    routes: [
      { id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-1', 'STOP-2'] },
      { id: 'A2', name: 'A2', color: '#abcdef', stopIds: ['STOP-3'] },
    ],
    stops: [
      {
        id: 'STOP-1',
        longName: 'First Stop',
        shortName: 'First',
        latitude: fix.latitude,
        longitude: fix.longitude,
        services: ['A1'],
      },
      {
        id: 'STOP-2',
        longName: 'Second Stop',
        shortName: 'Second',
        latitude: fix.latitude,
        longitude: fix.longitude + longitudeOffsetForMeters(300),
        services: ['A1'],
      },
      {
        id: 'STOP-3',
        longName: 'Other Route Stop',
        shortName: 'Other',
        latitude: fix.latitude,
          longitude: fix.longitude + longitudeOffsetForMeters(50),
        services: ['A2'],
      },
      {
        id: 'STOP-PUBLIC',
        longName: 'Public Stop',
        shortName: 'Public',
        latitude: fix.latitude,
        longitude: fix.longitude + longitudeOffsetForMeters(2),
        services: ['PUB:10'],
      },
    ],
  }
  return createTransitIndex(network)
}

describe('route-following location rules', () => {
  it('accepts only fresh fixes with accuracy at or below 25 metres', () => {
    expect(isRouteFollowFixUsable(fix, now)).toBe(true)
    expect(isRouteFollowFixUsable({ ...fix, accuracy: 25 }, now)).toBe(true)
    expect(isRouteFollowFixUsable({ ...fix, accuracy: 25.01 }, now)).toBe(false)
    expect(isRouteFollowFixUsable({ ...fix, timestamp: now - 30_001 }, now)).toBe(false)
    expect(isRouteFollowFixUsable({ ...fix, timestamp: now + 1 }, now)).toBe(false)
  })

  it('suggests the nearest internal stop when it is unambiguous and nearby', () => {
    const index = createIndex()
    const suggestion = findNearbyBusStopSuggestion(fix, index, new Set(), now)

    expect(suggestion?.id).toBe('STOP-1')
  })

  it('does not suggest an ambiguous, excluded, distant, or public-only stop', () => {
    const index = createIndex()
    const ambiguousIndex = createTransitIndex({
      version: 1,
      metadata,
      routes: [{ id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-1', 'STOP-2'] }],
      stops: [
        {
          id: 'STOP-1', longName: 'First', shortName: 'First',
          latitude: fix.latitude, longitude: fix.longitude, services: ['A1'],
        },
        {
          id: 'STOP-2', longName: 'Second', shortName: 'Second',
          latitude: fix.latitude,
          longitude: fix.longitude + longitudeOffsetForMeters(15),
          services: ['A1'],
        },
      ],
    })

    expect(findNearbyBusStopSuggestion(fix, ambiguousIndex, new Set(), now)).toBeNull()
    expect(findNearbyBusStopSuggestion(fix, index, new Set(['STOP-1']), now)?.id).toBe('STOP-3')
    expect(findNearbyBusStopSuggestion({ ...fix, longitude: 103.77 }, index, new Set(), now)).toBeNull()
  })

  it('limits route start suggestions to the selected route', () => {
    const index = createIndex()
    const route = index.routeById.get('A1')!

    expect(findRouteStopSuggestion(fix, route, index, new Set(), now)?.id).toBe('STOP-1')
    expect(getRouteStartIndex(route, 'STOP-2')).toBe(1)
    expect(getRouteStartIndex(route, 'STOP-3')).toBe(-1)
  })

  it('detects arrival only inside the configured stop radius using a usable fix', () => {
    const index = createIndex()
    const stop = index.stopById.get('STOP-1')!

    expect(isAtBusStop(fix, stop, now)).toBe(true)
    expect(isAtBusStop({ ...fix, longitude: fix.longitude + longitudeOffsetForMeters(76) }, stop, now)).toBe(false)
    expect(isAtBusStop({ ...fix, accuracy: 25.01 }, stop, now)).toBe(false)
  })
})
