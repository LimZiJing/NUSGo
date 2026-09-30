import { describe, expect, it } from 'vitest'
import { parseCanonicalShuttleStops } from './canonical'
import { parseRequestedStops, selectRequestedStops } from './request'
import type { ShuttleArrivalStop } from './snapshot'

const canonicalStops: readonly ShuttleArrivalStop[] = [
  { stopId: 'STOP-A', stopName: 'Canonical Stop A' },
  { stopId: 'STOP-B', stopName: 'Canonical Stop B' },
]

const snapshot = {
  observedAt: '2026-09-30T00:00:00.000Z',
  expiresAt: '2026-09-30T00:00:30.000Z',
  snapshotVersion: 'version-1',
  refreshedAt: '2026-09-30T00:00:00.000Z',
  nextRefreshAt: '2026-09-30T00:00:30.000Z',
  stops: {
    'STOP-A': { A1: { nextArrivalSeconds: 120, upcomingArrivalSeconds: [120], headwaySeconds: null } },
    'STOP-B': { D2: { nextArrivalSeconds: 240, upcomingArrivalSeconds: [240], headwaySeconds: null } },
  },
} as const

const canonicalNetwork = {
  stops: Array.from({ length: 33 }, (_, index) => ({
    id: `STOP-${index}`,
    longName: `Stop ${index}`,
  })),
}

describe('parseCanonicalShuttleStops', () => {
  it('requires exactly the 33 canonical stops with safe IDs and names', () => {
    expect(parseCanonicalShuttleStops(canonicalNetwork)).toHaveLength(33)
  })

  it('rejects a malformed canonical stop list', () => {
    expect(() => parseCanonicalShuttleStops({ stops: [] })).toThrow('Expected 33 canonical shuttle stops')
  })
})

describe('parseRequestedStops', () => {
  it('accepts stop IDs and legacy stop objects but always returns canonical names', () => {
    expect(parseRequestedStops(JSON.stringify([
      'STOP-A',
      { stopId: 'STOP-B', stopName: 'Untrusted browser name' },
    ]), canonicalStops)).toEqual(canonicalStops)
  })

  it('rejects a stop that is not in the canonical network', () => {
    expect(() => parseRequestedStops(JSON.stringify(['UNKNOWN']), canonicalStops))
      .toThrow('Unknown canonical shuttle stop: UNKNOWN')
  })
})

describe('selectRequestedStops', () => {
  it('returns only the requested stops while preserving snapshot metadata', () => {
    expect(selectRequestedStops(snapshot, [canonicalStops[1]!])).toEqual({
      ...snapshot,
      stops: { 'STOP-B': snapshot.stops['STOP-B'] },
    })
  })
})
