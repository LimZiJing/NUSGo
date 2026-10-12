import { describe, expect, it } from 'vitest'
import { getTripEndpointLabel, searchTripLocations } from './search'
import type { TransitStop } from '@navus/shared/transit/types'
import type { VenueLocationMap } from '@navus/shared/venue/types'

const venues: VenueLocationMap = {
  LT17: {
    roomName: 'Lecture Theatre 17',
    location: { x: 103.77, y: 1.3 },
  },
  'COM2-0112': {
    roomName: 'Seminar Room 1-12',
    location: { x: 103.78, y: 1.31 },
  },
}

const stops: TransitStop[] = [
  {
    id: 'STOP-B',
    longName: 'Central Bus Stop',
    shortName: 'CBS',
    latitude: 1.31,
    longitude: 103.78,
    services: ['A1'],
  },
  {
    id: 'STOP-A',
    longName: 'Central Library',
    shortName: 'Library',
    latitude: 1.3,
    longitude: 103.77,
    services: ['A1'],
  },
  {
    id: 'UTOWN',
    longName: 'University Town',
    shortName: 'UTown',
    latitude: 1.32,
    longitude: 103.79,
    services: ['A1'],
  },
]

describe('searchTripLocations', () => {
  it('returns no results for an empty query', () => {
    expect(searchTripLocations(venues, stops, '   ')).toEqual([])
  })

  it('searches venue codes and room names with stable venue endpoints', () => {
    expect(searchTripLocations(venues, stops, 'lt17')).toEqual([
      {
        endpoint: { kind: 'venue', id: 'LT17' },
        label: 'LT17',
        detail: 'Lecture Theatre 17',
      },
    ])
    expect(searchTripLocations(venues, stops, 'seminar')).toEqual([
      {
        endpoint: { kind: 'venue', id: 'COM2-0112' },
        label: 'COM2-0112',
        detail: 'Seminar Room 1-12',
      },
    ])
  })

  it('skips venues without coordinates', () => {
    const venuesWithMissingLocation: VenueLocationMap = {
      ...venues,
      'NO-LOCATION': {
        roomName: 'Unmapped Room',
      },
    }

    expect(searchTripLocations(venuesWithMissingLocation, [], 'no-location')).toEqual([])
  })

  it('searches stop IDs, long names, and short names', () => {
    expect(searchTripLocations(venues, stops, 'stop-b')).toEqual([
      {
        endpoint: { kind: 'stop', id: 'STOP-B' },
        label: 'Central Bus Stop',
        detail: 'CBS (STOP-B)',
      },
    ])
    expect(searchTripLocations(venues, stops, 'utown')).toEqual([
      {
        endpoint: { kind: 'stop', id: 'UTOWN' },
        label: 'University Town',
        detail: '',
      },
    ])
  })

  it('ranks and limits results deterministically across venues and stops', () => {
    expect(searchTripLocations(venues, stops, 'central', 1)).toEqual([
      {
        endpoint: { kind: 'stop', id: 'STOP-A' },
        label: 'Central Library',
        detail: 'Library (STOP-A)',
      },
    ])
    expect(searchTripLocations(venues, stops, 'central', 10).map((result) => result.endpoint)).toEqual([
      { kind: 'stop', id: 'STOP-A' },
      { kind: 'stop', id: 'STOP-B' },
    ])
  })
})

describe('searchTripLocations grouping', () => {
  it('ranks stops ahead of rooms even when a room matches more closely', () => {
    const roomVenues: VenueLocationMap = {
      'CLB-04-01H': {
        roomName: 'Central Library Seminar Room',
        location: { x: 103.77, y: 1.3 },
      },
      CENTRAL: {
        roomName: 'Exact Code Room',
        location: { x: 103.77, y: 1.3 },
      },
    }

    expect(searchTripLocations(roomVenues, stops, 'central').map((result) => result.endpoint)).toEqual([
      { kind: 'stop', id: 'STOP-A' },
      { kind: 'stop', id: 'STOP-B' },
      { kind: 'venue', id: 'CENTRAL' },
      { kind: 'venue', id: 'CLB-04-01H' },
    ])
  })
})

describe('getTripEndpointLabel', () => {
  it('resolves known endpoints to readable labels', () => {
    expect(getTripEndpointLabel({ kind: 'venue', id: 'LT17' }, venues, stops)).toBe(
      'Lecture Theatre 17',
    )
    expect(getTripEndpointLabel({ kind: 'stop', id: 'STOP-A' }, venues, stops)).toBe(
      'Central Library',
    )
  })

  it('falls back to the stable endpoint ID when data is unavailable', () => {
    expect(getTripEndpointLabel({ kind: 'venue', id: 'MISSING' }, venues, stops)).toBe('MISSING')
    expect(getTripEndpointLabel({ kind: 'stop', id: 'MISSING' }, venues, stops)).toBe('MISSING')
  })

  it('labels Current location without an identifier', () => {
    expect(getTripEndpointLabel({
      kind: 'current-location',
      coordinate: { longitude: 103.78, latitude: 1.29 },
    }, venues, stops)).toBe('Current location')
  })
})
