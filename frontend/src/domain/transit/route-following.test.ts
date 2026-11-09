import { describe, expect, it } from 'vitest'
import type { TransitNetwork } from '@nusgo/shared/transit/types'
import { createTransitIndex } from './index'
import {
  findNearbyBusStopCandidates,
  getRouteStartIndex,
  isAtBusStop,
  isRouteFollowFixUsable,
  STOP_CONFIRMATION_RADIUS_METERS,
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

  it('returns internal bus stops inside the 25 metre confirmation radius in distance order', () => {
    const candidates = findNearbyBusStopCandidates(fix, createIndex(), undefined, now)

    expect(STOP_CONFIRMATION_RADIUS_METERS).toBe(25)
    expect(candidates.map(({ stop }) => stop.id)).toEqual(['STOP-1'])
  })

  it('uses route order and advances only within the configured stop radius', () => {
    const index = createIndex()
    const route = index.routeById.get('A1')!
    const stop = index.stopById.get('STOP-1')!

    expect(getRouteStartIndex(route, 'STOP-2')).toBe(1)
    expect(getRouteStartIndex(route, 'STOP-3')).toBe(-1)
    expect(isAtBusStop(fix, stop, now)).toBe(true)
    expect(isAtBusStop({ ...fix, longitude: fix.longitude + longitudeOffsetForMeters(76) }, stop, now)).toBe(false)
    expect(isAtBusStop({ ...fix, accuracy: 25.01 }, stop, now)).toBe(false)
  })
})