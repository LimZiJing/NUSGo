import { describe, expect, it } from 'vitest'
import type { Building } from '@nusgo/shared/venue/buildings'
import type { TransitStop } from '@nusgo/shared/transit/types'
import { buildBuildingIndex } from '../venue/building-index'
import type { VenueMap } from '@nusgo/shared/venue/types'
import type { PersonalWaypoint } from '../waypoints/personal/personal-waypoint'
import { getTripEndpointLabel, searchTripLocations } from './search'

const venues: VenueMap = {
  LT17: { kind: 'room', roomName: 'Lecture Theatre 17', location: { x: 103.77, y: 1.3 } },
  'COM2-0112': { kind: 'room', roomName: 'Seminar Room 1-12', location: { x: 103.78, y: 1.31 } },
  'the-terrace-canteen': {
    kind: 'food',
    name: 'The Terrace',
    foodType: 'canteen',
    location: { x: 103.77458, y: 1.29458 },
  },
}

const stops: TransitStop[] = [
  { id: 'STOP-B', longName: 'Central Bus Stop', shortName: 'CBS', latitude: 1.31, longitude: 103.78, services: ['A1'] },
  { id: 'STOP-A', longName: 'Central Library', shortName: 'Library', latitude: 1.3, longitude: 103.77, services: ['A1'] },
  { id: 'UTOWN', longName: 'University Town', shortName: 'UTown', latitude: 1.32, longitude: 103.79, services: ['A1'] },
]

const personalWaypoints: PersonalWaypoint[] = [{
  id: '00000000-0000-4000-8000-000000000041',
  name: 'Quiet bench',
  category: 'Rest areas',
  coordinate: { longitude: 103.78, latitude: 1.29 },
  markerColor: 'blue',
  markerIcon: 'dot',
  note: 'Near the sheltered walkway',
  createdAt: '2026-10-25T00:00:00.000Z',
  updatedAt: '2026-10-25T00:00:00.000Z',
}]

describe('searchTripLocations', () => {
  it('returns no results for an empty query', () => {
    expect(searchTripLocations(venues, stops, '   ')).toEqual([])
  })

  it('shows Rooms by code with room-name detail', () => {
    expect(searchTripLocations(venues, stops, 'lt17')).toMatchObject([{
      kind: 'room',
      endpoint: { kind: 'venue', id: 'LT17' },
      label: 'LT17',
      detail: 'Lecture Theatre 17',
    }])
    expect(searchTripLocations(venues, stops, 'seminar')).toMatchObject([{
      kind: 'room',
      endpoint: { kind: 'venue', id: 'COM2-0112' },
      detail: 'Seminar Room 1-12',
    }])
  })

  it('shows Food by its public name, foodType, and stable venue endpoint', () => {
    expect(searchTripLocations(venues, [], 'the terrace')).toMatchObject([{
      kind: 'food',
      endpoint: { kind: 'venue', id: 'the-terrace-canteen' },
      label: 'The Terrace',
      detail: 'Canteen',
      venue: venues['the-terrace-canteen'],
    }])
    expect(getTripEndpointLabel({ kind: 'venue', id: 'the-terrace-canteen' }, venues, [])).toBe('The Terrace')
  })

  it('keeps Rooms and Food separate when filtering and skips unlocated venues', () => {
    const unlocated: VenueMap = { ...venues, 'NO-LOCATION': { kind: 'room', roomName: 'Unmapped Room' } }
    expect(searchTripLocations(unlocated, [], 'terrace', 8, undefined, ['room'])).toEqual([])
    expect(searchTripLocations(unlocated, [], 'terrace', 8, undefined, ['food']).map(({ kind }) => kind)).toEqual(['food'])
    expect(searchTripLocations(unlocated, [], 'no-location')).toEqual([])
  })

  it('searches stop IDs, long names, and short names', () => {
    expect(searchTripLocations({}, stops, 'stop-b')).toMatchObject([{
      kind: 'stop',
      endpoint: { kind: 'stop', id: 'STOP-B' },
      label: 'Central Bus Stop',
      detail: 'CBS (STOP-B)',
    }])
    expect(searchTripLocations({}, stops, 'utown')).toMatchObject([{ kind: 'stop', detail: '' }])
  })

  it('searches Personal Waypoints by name or category', () => {
    expect(searchTripLocations({}, [], 'quiet bench', 8, undefined, undefined, personalWaypoints)).toMatchObject([{
      kind: 'personal-waypoint',
      label: 'Quiet bench',
      detail: 'Rest areas',
    }])
    expect(searchTripLocations({}, [], 'rest areas', 8, undefined, undefined, personalWaypoints)).toHaveLength(1)
    expect(searchTripLocations({}, [], 'sheltered walkway', 8, undefined, undefined, personalWaypoints)).toEqual([])
  })

  it('ranks and limits stops ahead of Rooms and Foods', () => {
    expect(searchTripLocations(venues, stops, 'central', 1).map(({ kind }) => kind)).toEqual(['stop'])
    expect(searchTripLocations(venues, stops, 'the terrace', 8, undefined, ['room'])).toEqual([])
  })
})

describe('searchTripLocations with buildings', () => {
  const makeBuilding = (id: string, name: string, extra: Partial<Building> = {}): Building => ({
    id, name, aliases: [], elementId: `way/${id}`, location: { x: 103.775, y: 1.295 },
    locationKind: 'centroid', roomCodePrefixes: [], sourceRefs: [], ...extra,
  })
  const buildings = buildBuildingIndex([
    makeBuilding('com3', 'COM3', { aliases: ['COM 3', 'Computing 3'], address: '13 Computing Drive' }),
    makeBuilding('elm-college-2', 'Elm College', { groupKey: 'elm-college' }),
    makeBuilding('elm-college-1', 'Elm College', { groupKey: 'elm-college' }),
    makeBuilding('elm-college-3', 'Elm College', { groupKey: 'elm-college' }),
  ])
  const venuesWithCom3: VenueMap = {
    'COM3-0201': { kind: 'room', roomName: 'Computing room', location: { x: 103.775, y: 1.295 }, buildingId: 'com3' },
  }
  const stopsWithCom3: TransitStop[] = [
    { id: 'COM3', longName: 'COM3', shortName: 'COM3', latitude: 1.2944, longitude: 103.7752, services: ['A1'] },
  ]
  const search = (query: string) => searchTripLocations(venuesWithCom3, stopsWithCom3, query, 8, buildings)

  it.each(['COM3', 'com 3', 'computing 3'])('finds the COM3 building for "%s"', (query) => {
    expect(search(query).map((result) => result.endpoint)).toContainEqual({ kind: 'building', id: 'com3' })
  })

  it('lists the building and bus stop separately from the Room', () => {
    expect(search('com3').map((result) => result.endpoint)).toEqual([
      { kind: 'building', id: 'com3' },
      { kind: 'stop', id: 'COM3' },
      { kind: 'venue', id: 'COM3-0201' },
    ])
  })

  it('limits results to the requested kind before applying the cap', () => {
    expect(searchTripLocations(venuesWithCom3, stopsWithCom3, 'com', 1, buildings, ['room']).map(({ endpoint }) => endpoint))
      .toEqual([{ kind: 'venue', id: 'COM3-0201' }])
  })

  it('shows a grouped building once with its name and parts detail', () => {
    expect(searchTripLocations({}, [], 'elm college', 8, buildings)).toMatchObject([{
      kind: 'building',
      endpoint: { kind: 'building', id: 'elm-college' },
      label: 'Elm College',
      detail: '3 buildings',
    }])
  })
})

describe('getTripEndpointLabel', () => {
  it('uses readable Room, Food, Building, stop, and current-location labels', () => {
    expect(getTripEndpointLabel({ kind: 'venue', id: 'LT17' }, venues, stops)).toBe('Lecture Theatre 17')
    expect(getTripEndpointLabel({ kind: 'venue', id: 'the-terrace-canteen' }, venues, stops)).toBe('The Terrace')
    expect(getTripEndpointLabel({ kind: 'stop', id: 'STOP-A' }, venues, stops)).toBe('Central Library')
    expect(getTripEndpointLabel({ kind: 'venue', id: 'MISSING' }, venues, stops)).toBe('MISSING')
    expect(getTripEndpointLabel({
      kind: 'current-location', coordinate: { longitude: 103.78, latitude: 1.29 },
    }, venues, stops)).toBe('Current location')
  })
})
