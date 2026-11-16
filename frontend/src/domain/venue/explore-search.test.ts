import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Building, BuildingCatalogue } from '@nusgo/shared/venue/buildings'
import type { TransitStop } from '@nusgo/shared/transit/types'
import type { VenueLocationMap } from '@nusgo/shared/venue/types'
import { mergeVenueAndEateryMaps, validateEateryLocationMap, validateVenueLocationMap } from '@nusgo/shared/venue/validation'
import { buildBuildingIndex } from './building-index'
import { linkVenuesToBuildings } from './building-links'
import { searchEateries, searchExplore, type ExploreSearchResult } from './explore-search'

function building(overrides: Partial<Building> & Pick<Building, 'id' | 'name'>): Building {
  return {
    aliases: [],
    elementId: `way/${overrides.id}`,
    location: { x: 103.77, y: 1.29 },
    locationKind: 'centroid',
    roomCodePrefixes: [],
    sourceRefs: [],
    ...overrides,
  }
}

const room = (roomName: string) => ({ roomName, location: { x: 103.77, y: 1.29 } })
const buildings = buildBuildingIndex([
  building({ id: 'com1', name: 'COM1', aliases: ['COM 1', 'Computing 1'], roomCodePrefixes: ['COM1'] }),
  building({ id: 'lt-17', name: 'LT 17', aliases: ['LT17'], roomCodePrefixes: ['LT17'] }),
  building({ id: 'saga-1', name: 'Saga College', groupKey: 'saga' }),
  building({ id: 'saga-2', name: 'Saga College', groupKey: 'saga' }),
])
const venues: VenueLocationMap = {
  'COM1-0210': room('Seminar Room 10'),
  LT17: room('Lecture Theatre 17'),
  'Y-CR3': room('Yale classroom'),
  Pinnacle: room('Pinnacle'),
}
const links = linkVenuesToBuildings(venues, buildings)
const search = (query: string) => searchExplore({ venues, buildings, links }, query)

describe('searchExplore', () => {
  it('returns nothing for an empty query', () => {
    expect(search('  ')).toEqual([])
  })

  it('lists a matching building before the rooms inside it', () => {
    const results = search('com1')

    expect(results.map(label)).toEqual(['building:com1', 'venue:COM1-0210'])
  })

  it('shows a whole-building venue once, as the building, and still finds it by its room name', () => {
    const byCode = search('lt17')
    const byRoomName = search('lecture theatre 17')

    for (const results of [byCode, byRoomName]) {
      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({ kind: 'building', entry: { id: 'lt-17' } })
    }
  })

  it('shows a repeated-name group once', () => {
    const results = search('saga')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ kind: 'building', entry: { id: 'saga', parts: [{ id: 'saga-1' }, { id: 'saga-2' }] } })
  })

  it('keeps venues without a catalogue building searchable as venues', () => {
    expect(search('pinnacle')).toEqual([{ kind: 'venue', result: { code: 'Pinnacle', venue: venues.Pinnacle } }])
    expect(search('y-cr3')).toHaveLength(1)
  })
})

const stop = (id: string, longName: string, shortName = longName): TransitStop => ({
  id,
  longName,
  shortName,
  latitude: 1.29,
  longitude: 103.77,
  services: [],
})
const label = (result: ExploreSearchResult) =>
  result.kind === 'stop' ? `stop:${result.stop.id}` : result.kind === 'building' ? `building:${result.entry.id}` : `venue:${result.result.code}`
const withStops = (stops: readonly TransitStop[]) => ({ venues, buildings, links, stops })

describe('searchExplore with bus stops', () => {
  const rankingStops = [
    stop('BS-NEAR', 'Near COM1 Gate', 'Gate'),
    stop('BS-COM1', 'Computing Gate', 'COM1'),
  ]

  it('ranks by match priority across stops, buildings and rooms before kind', () => {
    // Exact: stop short name and building name. Prefix: room code. Partial: stop long name.
    expect(searchExplore(withStops(rankingStops), 'com1').map(label)).toEqual([
      'stop:BS-COM1',
      'building:com1',
      'venue:COM1-0210',
      'stop:BS-NEAR',
    ])
  })

  it('matches a stop by ID, long name or short name, ignoring case', () => {
    const sources = withStops([stop('KR-MRT', 'Kent Ridge MRT Station', 'KR MRT')])

    for (const query of ['kr-mrt', 'KENT RIDGE', '  kr mrt  ']) {
      expect(searchExplore(sources, query)).toEqual([{ kind: 'stop', stop: sources.stops[0] }])
    }
  })

  it('returns nothing for a whitespace-only query', () => {
    expect(searchExplore(withStops(rankingStops), '   ')).toEqual([])
  })

  it('returns a same-named stop and venue as separate results, stop first', () => {
    const results = searchExplore(withStops([stop('PINNACLE-BUS', 'Pinnacle')]), 'pinnacle')

    expect(results).toEqual([
      { kind: 'stop', stop: stop('PINNACLE-BUS', 'Pinnacle') },
      { kind: 'venue', result: { code: 'Pinnacle', venue: venues.Pinnacle } },
    ])
  })

  it('still returns a venue without coordinates', () => {
    const venuesWithoutCoordinates: VenueLocationMap = { ...venues, 'HID-01': { roomName: 'Hidden Room' } }
    const results = searchExplore(
      { venues: venuesWithoutCoordinates, buildings, links: linkVenuesToBuildings(venuesWithoutCoordinates, buildings) },
      'hidden',
    )

    expect(results).toEqual([{ kind: 'venue', result: { code: 'HID-01', venue: { roomName: 'Hidden Room' } } }])
  })

  it('limits the combined list and breaks ties deterministically', () => {
    const gates = Array.from({ length: 10 }, (_, index) => stop(`G-${String(index + 1).padStart(2, '0')}`, `Gate ${index + 1}`))
    const forward = searchExplore(withStops(gates), 'gate')
    const reversed = searchExplore(withStops([...gates].reverse()), 'gate')

    expect(forward).toHaveLength(8)
    expect(forward.map(label).slice(0, 3)).toEqual(['stop:G-01', 'stop:G-02', 'stop:G-03'])
    expect(reversed).toEqual(forward)
    expect(searchExplore(withStops(gates), 'gate', 3).map(label)).toEqual(['stop:G-01', 'stop:G-02', 'stop:G-03'])
  })
})

describe('searchEateries', () => {
  const eateries: VenueLocationMap = {
    'yih-central-square': { roomName: 'YIH (Central Square)', displayName: 'YIH (Central Square)', category: 'canteen' },
    'frontier-canteen': { roomName: 'Frontier', displayName: 'Frontier', category: 'canteen' },
    'wild-skew': { roomName: 'Wild Skew', displayName: 'Wild Skew', category: 'restaurant' },
    'starbucks-cde': { roomName: 'Starbucks (CDE)', displayName: 'Starbucks (CDE)', category: 'drinks & snacks' },
  }

  it('lists every matching destination by display name and filters by category and query', () => {
    expect(searchEateries(eateries, 'canteen', '').map(({ code }) => code)).toEqual([
      'frontier-canteen',
      'yih-central-square',
    ])
    expect(searchEateries(eateries, 'drinks & snacks', 'CDE')).toEqual([
      { code: 'starbucks-cde', venue: eateries['starbucks-cde'] },
    ])
    expect(searchEateries(eateries, 'restaurant', '').map(({ code }) => code)).toEqual(['wild-skew'])
    expect(searchEateries(eateries, 'canteen', 'starbucks')).toEqual([])
  })
})

describe('searchExplore with the real data', () => {
  const realVenues = mergeVenueAndEateryMaps(
    validateVenueLocationMap(JSON.parse(readFileSync('public/data/venues.json', 'utf8'))),
    validateEateryLocationMap(JSON.parse(readFileSync('public/data/eateries.json', 'utf8'))),
  )
  const catalogue = JSON.parse(readFileSync('public/data/buildings.json', 'utf8')) as BuildingCatalogue
  const realBuildings = buildBuildingIndex(catalogue.buildings)
  const sources = { venues: realVenues, buildings: realBuildings, links: linkVenuesToBuildings(realVenues, realBuildings) }

  it('shows the Frontier buildings and the distinct Frontier canteen, not the old room record', () => {
    const results = searchExplore(sources, 'frontier')

    expect(results.map(label)).toEqual(['building:frontier', 'venue:frontier-canteen'])
  })

  it('keeps the Frontier canteen available as an eatery without linking it to a building', () => {
    const frontier = searchEateries(realVenues, 'canteen', 'frontier')

    expect(frontier).toHaveLength(1)
    expect(frontier[0]).toMatchObject({ code: 'frontier-canteen', venue: { category: 'canteen', displayName: 'Frontier' } })
    expect(linkVenuesToBuildings(realVenues, realBuildings).buildingByVenueCode.has('frontier-canteen')).toBe(false)
  })

  it('keeps a reused whole-building venue linked while searching it as an eatery', () => {
    const venuesWithFrontierEatery = mergeVenueAndEateryMaps(
      validateVenueLocationMap({ Frontier: { roomName: 'Frontier', floor: 4 } }),
      validateEateryLocationMap({
        Frontier: { name: 'Frontier Canteen', category: 'canteen', location: { x: 103.78, y: 1.29 } },
      }),
    )
    const links = linkVenuesToBuildings(venuesWithFrontierEatery, realBuildings)
    const results = searchExplore({ venues: venuesWithFrontierEatery, buildings: realBuildings, links }, 'frontier')

    expect(links.wholeBuildingVenueCodes.has('Frontier')).toBe(true)
    expect(links.nusmodsVenueCodeByBuildingId.get('frontier')).toBe('Frontier')
    expect(results.map(label)).toEqual(['building:frontier', 'venue:Frontier'])
  })

  it('shows Cendana, Saga and Elm College once each', () => {
    for (const [query, id, parts] of [['cendana', 'cendana-college', 5], ['saga', 'saga-college', 6], ['elm college', 'elm-college', 3]] as const) {
      const results = searchExplore(sources, query).filter((result) => result.kind === 'building' && result.entry.id === id)
      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({ kind: 'building', entry: { id } })
      const [first] = results
      expect(first.kind === 'building' ? first.entry.parts : []).toHaveLength(parts)
    }
  })

  it('keeps Pinnacle and LAW_SR3 as venues because they have no catalogue building', () => {
    expect(searchExplore(sources, 'pinnacle').map((result) => result.kind)).toContain('venue')
    expect(searchExplore(sources, 'law_sr3')).toEqual([
      { kind: 'venue', result: { code: 'LAW_SR3', venue: realVenues.LAW_SR3 } },
    ])
  })
})
