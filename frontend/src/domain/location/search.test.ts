import { describe, expect, it } from 'vitest'
import { getTripEndpointLabel, searchTripLocations } from './search'
import type { Building } from '@navus/shared/venue/buildings'
import type { TransitStop } from '@navus/shared/transit/types'
import { buildBuildingIndex } from '../venue/building-index'
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

describe('getTripEndpointLabel for a building of a group', () => {
  const helix = (overrides: Partial<Building> & Pick<Building, 'id'>): Building => ({
    name: 'Helix House', aliases: [], elementId: `way/${overrides.id}`, location: { x: 103.78, y: 1.29 },
    locationKind: 'centroid', roomCodePrefixes: [], sourceRefs: [], groupKey: 'helix-house', ...overrides,
  })
  const index = buildBuildingIndex([
    helix({ id: 'helix-house', groupRole: 'entrance' }),
    helix({ id: 'helix-18-19', partLabel: 'Blocks 18-19', blocks: ['18', '19'] }),
  ])

  it('names the group alone for the group and adds the block label for one of its buildings', () => {
    expect(getTripEndpointLabel({ kind: 'building', id: 'helix-house' }, venues, stops, index)).toBe('Helix House')
    expect(getTripEndpointLabel({ kind: 'building', id: 'helix-18-19' }, venues, stops, index)).toBe(
      'Helix House · Blocks 18-19',
    )
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

  it('labels a building by its name and falls back to its ID when the catalogue is unavailable', () => {
    const index = buildBuildingIndex([
      { id: 'com3', name: 'COM3', aliases: [], elementId: 'way/1', location: { x: 103.77, y: 1.29 }, roomCodePrefixes: [], sourceRefs: [] },
    ])

    expect(getTripEndpointLabel({ kind: 'building', id: 'com3' }, venues, stops, index)).toBe('COM3')
    expect(getTripEndpointLabel({ kind: 'building', id: 'com3' }, venues, stops)).toBe('com3')
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

describe('searchTripLocations with buildings', () => {
  const makeBuilding = (id: string, name: string, extra: Partial<Building> = {}): Building => ({
    id,
    name,
    aliases: [],
    elementId: `way/${id}`,
    location: { x: 103.775, y: 1.295 },
    locationKind: 'centroid',
    roomCodePrefixes: [],
    sourceRefs: [],
    ...extra,
  })
  const buildings = buildBuildingIndex([
    makeBuilding('com3', 'COM3', { aliases: ['COM 3', 'Computing 3'], address: '13 Computing Drive' }),
    makeBuilding('biz-2', 'BIZ 2', { aliases: ['BIZ2'] }),
    makeBuilding('elm-college-2', 'Elm College', { groupKey: 'elm-college' }),
    makeBuilding('elm-college-1', 'Elm College', { groupKey: 'elm-college' }),
    makeBuilding('elm-college-3', 'Elm College', { groupKey: 'elm-college' }),
  ])
  const venuesWithCom3: VenueLocationMap = {
    'COM3-0201': { roomName: 'Computing room', location: { x: 103.775, y: 1.295 } },
  }
  const stopsWithCom3: TransitStop[] = [
    { id: 'COM3', longName: 'COM3', shortName: 'COM3', latitude: 1.2944, longitude: 103.7752, services: ['A1'] },
  ]
  const search = (query: string) =>
    searchTripLocations(venuesWithCom3, stopsWithCom3, query, 8, buildings)

  it.each(['COM3', 'com 3', 'computing 3', 'COM 3'])('finds the COM3 building for "%s"', (query) => {
    expect(search(query).map((result) => result.endpoint)).toContainEqual({ kind: 'building', id: 'com3' })
  })

  it('lists the building and its bus stop as separate results with their own identities', () => {
    expect(search('com3').map((result) => result.endpoint)).toEqual([
      { kind: 'building', id: 'com3' },
      { kind: 'stop', id: 'COM3' },
      { kind: 'venue', id: 'COM3-0201' },
    ])
  })

  it('ranks buildings and stops ahead of rooms and labels a building by name with its address', () => {
    const results = search('com')
    expect(results.at(-1)?.endpoint).toEqual({ kind: 'venue', id: 'COM3-0201' })
    expect(results.find((result) => result.endpoint.kind === 'building')).toMatchObject({
      label: 'COM3',
      detail: '13 Computing Drive',
    })
  })

  it('limits results to the requested kinds before applying the result cap', () => {
    const results = searchTripLocations(venuesWithCom3, stopsWithCom3, 'com', 1, buildings, ['venue'])

    expect(results.map((result) => result.endpoint)).toEqual([{ kind: 'venue', id: 'COM3-0201' }])
  })

  it('shows a repeated-name group as one result that keeps the group identity', () => {
    const results = searchTripLocations({}, [], 'elm college', 8, buildings)

    expect(results).toEqual([
      { endpoint: { kind: 'building', id: 'elm-college' }, label: 'Elm College', detail: '3 buildings' },
    ])
  })
})
