import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Building, BuildingCatalogue } from '@nusgo/shared/venue/buildings'
import type { TransitStop } from '@nusgo/shared/transit/types'
import type { VenueMap } from '@nusgo/shared/venue/types'
import { composeVenueData, validateBuildingCatalogue, validateFoodLocationMap, validateVenueSourceMap } from '@nusgo/shared/venue/validation'
import { buildBuildingIndex } from './building-index'
import { linkVenuesToBuildings } from './building-links'
import { searchExplore, type ExploreSearchResult } from './explore-search'

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

const venues: VenueMap = {
  'COM1-0210': { kind: 'room', roomName: 'Seminar Room 10', location: { x: 103.77, y: 1.29 }, buildingId: 'com1' },
  'Y-CR3': { kind: 'room', roomName: 'Yale classroom', location: { x: 103.77, y: 1.29 } },
  Pinnacle: { kind: 'room', roomName: 'Pinnacle', location: { x: 103.77, y: 1.29 } },
  'the-terrace-canteen': {
    kind: 'food',
    name: 'The Terrace',
    foodType: 'canteen',
    location: { x: 103.77, y: 1.29 },
  },
}
const catalogue: BuildingCatalogue = {
  version: 1,
  source: { name: 'Test catalogue', url: 'https://example.test', fetchedOn: '2026-11-19', licenceNote: 'Test data' },
  buildings: [
    building({ id: 'com1', name: 'COM1', aliases: ['COM 1', 'Computing 1'], roomCodePrefixes: ['COM1'] }),
    building({ id: 'lt-17', name: 'LT 17', aliases: ['LT17'], roomCodePrefixes: ['LT17'] }),
  ],
}
const buildings = buildBuildingIndex(catalogue.buildings)
const links = linkVenuesToBuildings(venues, buildings)
const search = (query: string) => searchExplore({ venues, buildings, links }, query)

describe('searchExplore', () => {
  it('returns nothing for an empty query', () => {
    expect(search('  ')).toEqual([])
  })

  it('lists a matching building before the rooms inside it', () => {
    expect(search('com1').map(label)).toEqual(['building:com1', 'venue:COM1-0210'])
  })

  it('searches Room and Food by their code or public name', () => {
    expect(search('the terrace')).toEqual([{
      kind: 'venue',
      result: { code: 'the-terrace-canteen', venue: venues['the-terrace-canteen'] },
    }])
    expect(search('the-terrace-canteen').map(label)).toEqual(['venue:the-terrace-canteen'])
    expect(search('seminar room 10').map(label)).toEqual(['venue:COM1-0210'])
  })

  it('keeps Foods out of room building-prefix links', () => {
    const foodOnly = composeVenueData(
      validateVenueSourceMap({}),
      validateFoodLocationMap({
        'COM1-cafe': { name: 'Computing Cafe', foodType: 'drinks & snacks', location: { x: 103.77, y: 1.29 } },
      }),
      catalogue,
    ).venues
    const foodLinks = linkVenuesToBuildings(foodOnly, buildings)

    expect(foodOnly['COM1-cafe']).toMatchObject({ kind: 'food' })
    expect(foodOnly['COM1-cafe']).not.toHaveProperty('buildingId')
    expect(foodLinks.buildingByVenueCode.has('COM1-cafe')).toBe(false)
    expect(foodLinks.roomCountByBuildingId.get('com1')).toBeUndefined()
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

  it('ranks by match priority across stops, buildings, Rooms and Food before kind', () => {
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

  it('returns a Room without coordinates', () => {
    const venuesWithoutCoordinates: VenueMap = { ...venues, 'HID-01': { kind: 'room', roomName: 'Hidden Room' } }
    const results = searchExplore(
      { venues: venuesWithoutCoordinates, buildings, links: linkVenuesToBuildings(venuesWithoutCoordinates, buildings) },
      'hidden',
    )
    expect(results).toEqual([{ kind: 'venue', result: { code: 'HID-01', venue: { kind: 'room', roomName: 'Hidden Room' } } }])
  })

  it('limits the combined list and breaks ties deterministically', () => {
    const gates = Array.from({ length: 10 }, (_, index) => stop(`G-${String(index + 1).padStart(2, '0')}`, `Gate ${index + 1}`))
    const forward = searchExplore(withStops(gates), 'gate')
    const reversed = searchExplore(withStops([...gates].reverse()), 'gate')
    expect(forward).toHaveLength(8)
    expect(forward.map(label).slice(0, 3)).toEqual(['stop:G-01', 'stop:G-02', 'stop:G-03'])
    expect(reversed).toEqual(forward)
    expect(searchExplore(withStops(gates), 'gate', 'all', 3).map(label)).toEqual(['stop:G-01', 'stop:G-02', 'stop:G-03'])
  })
})

describe('searchExplore result filters', () => {
  const matchingStop = stop('BS-COM1', 'Computing Gate', 'COM1')
  const sources = withStops([matchingStop])

  it.each([
    ['food', 'terrace', ['venue:the-terrace-canteen']],
    ['room', 'com1', ['venue:COM1-0210']],
    ['building', 'com1', ['building:com1']],
    ['stop', 'com1', ['stop:BS-COM1']],
  ] as const)('limits a %s query to that result kind', (filter, query, expected) => {
    expect(searchExplore(sources, query, filter).map(label)).toEqual(expected)
  })

  it('applies the filter before the result limit', () => {
    const terraceStop = stop('TERRACE-GATE', 'Terrace Gate')
    const mixedSources = withStops([terraceStop])

    expect(searchExplore(mixedSources, 'terrace', 'all', 1).map(label)).toEqual(['stop:TERRACE-GATE'])
    expect(searchExplore(mixedSources, 'terrace', 'food', 1).map(label)).toEqual(['venue:the-terrace-canteen'])
  })

  it('browses the selected kind alphabetically when the query is empty', () => {
    expect(searchExplore(sources, '', 'room').map(label)).toEqual([
      'venue:COM1-0210',
      'venue:Pinnacle',
      'venue:Y-CR3',
    ])
    expect(searchExplore(sources, '', 'all')).toEqual([])
  })

  it('breaks equal display-name ties by stable result key', () => {
    const browseVenues: VenueMap = {
      'Z-CAFE': { kind: 'food', name: 'Cafe', foodType: 'drinks & snacks', location: { x: 103.77, y: 1.29 } },
      'A-CAFE': { kind: 'food', name: 'Cafe', foodType: 'drinks & snacks', location: { x: 103.77, y: 1.29 } },
      BENTO: { kind: 'food', name: 'Bento', foodType: 'restaurant', location: { x: 103.77, y: 1.29 } },
    }
    const browseSources = {
      venues: browseVenues,
      buildings,
      links: linkVenuesToBuildings(browseVenues, buildings),
    }

    expect(searchExplore(browseSources, '', 'food').map(label)).toEqual([
      'venue:BENTO',
      'venue:A-CAFE',
      'venue:Z-CAFE',
    ])
  })
})

describe('searchExplore with the real data', () => {
  const catalogue = validateBuildingCatalogue(JSON.parse(readFileSync('public/data/buildings.json', 'utf8')))
  const venueData = composeVenueData(
    validateVenueSourceMap(JSON.parse(readFileSync('public/data/venues.json', 'utf8'))),
    validateFoodLocationMap(JSON.parse(readFileSync('public/data/food.json', 'utf8'))),
    catalogue,
  )
  const realVenues = venueData.venues
  const realBuildings = buildBuildingIndex(catalogue.buildings, catalogue.source, venueData.wholeBuildingVenueAliases)
  const sources = { venues: realVenues, buildings: realBuildings, links: linkVenuesToBuildings(realVenues, realBuildings) }

  it('shows the Frontier buildings and distinct Frontier canteen, not the old room record', () => {
    expect(searchExplore(sources, 'frontier').map(label)).toEqual(['building:frontier', 'venue:frontier-canteen'])
  })

  it('shows whole-building identities once and keeps their NUSMods alias', () => {
    for (const code of ['LT17', 'Frontier']) {
      expect(realVenues[code]).toBeUndefined()
      expect(sources.links.wholeBuildingVenueCodes.has(code)).toBe(true)
    }
    expect(sources.links.nusmodsVenueCodeByBuildingId.get('frontier')).toBe('Frontier')
  })

  it('searches Food by its public name with typed food detail', () => {
    expect(searchExplore(sources, 'the terrace').map((result) => result.kind === 'venue' ? result.result : result)).toEqual([
      { code: 'the-terrace-canteen', venue: { kind: 'food', name: 'The Terrace', foodType: 'canteen', location: { x: 103.77458, y: 1.29458 } } },
    ])
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

  it('keeps Pinnacle and LAW_SR3 as Rooms because they have no catalogue building', () => {
    expect(searchExplore(sources, 'pinnacle').map((result) => result.kind)).toContain('venue')
    expect(searchExplore(sources, 'law_sr3')).toEqual([
      { kind: 'venue', result: { code: 'LAW_SR3', venue: realVenues.LAW_SR3 } },
    ])
  })
})
