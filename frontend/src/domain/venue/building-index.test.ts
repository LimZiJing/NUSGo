import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Building, BuildingCatalogue } from '@navus/shared/venue/buildings'
import { buildBuildingIndex, searchBuildings } from './building-index'

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

describe('buildBuildingIndex', () => {
  it('keeps an ungrouped building as one entry under its own ID', () => {
    const com1 = building({ id: 'com1', name: 'COM1', aliases: ['COM 1'], roomCodePrefixes: ['COM1'] })

    const index = buildBuildingIndex([com1])

    expect(index.entries).toEqual([
      {
        id: 'com1',
        name: 'COM1',
        aliases: ['COM 1'],
        parts: [com1],
        location: com1.location,
        locationKind: 'centroid',
      },
    ])
    expect(index.byId.get('com1')).toBe(index.entries[0])
  })

  it('collapses buildings sharing a group key into one entry that keeps every part, ordered by ID', () => {
    const second = building({ id: 'elm-college-2', name: 'Elm College', groupKey: 'elm-college' })
    const first = building({ id: 'elm-college-1', name: 'Elm College', groupKey: 'elm-college' })

    const index = buildBuildingIndex([second, first])

    expect(index.entries).toHaveLength(1)
    expect(index.entries[0]).toMatchObject({ id: 'elm-college', name: 'Elm College' })
    expect(index.entries[0].parts).toEqual([first, second])
  })

  it('places a group at the part nearest the centre of all its parts, never at an invented point', () => {
    const west = building({ id: 'saga-college-1', name: 'Saga College', groupKey: 'saga-college', location: { x: 103.770, y: 1.300 } })
    const middle = building({
      id: 'saga-college-2',
      name: 'Saga College',
      groupKey: 'saga-college',
      location: { x: 103.772, y: 1.300 },
      locationKind: 'provisional-entrance',
    })
    const east = building({ id: 'saga-college-3', name: 'Saga College', groupKey: 'saga-college', location: { x: 103.775, y: 1.300 } })

    const [entry] = buildBuildingIndex([east, west, middle]).entries

    expect(entry.location).toEqual(middle.location)
    expect(entry.locationKind).toBe('provisional-entrance')
  })

  it('collapses the repeated-name colleges in the real catalogue and nothing else', () => {
    const catalogue = JSON.parse(
      readFileSync('public/data/buildings.json', 'utf8'),
    ) as BuildingCatalogue

    const index = buildBuildingIndex(catalogue.buildings)
    const partCounts = Object.fromEntries(
      index.entries.filter((entry) => entry.parts.length > 1).map((entry) => [entry.id, entry.parts.length]),
    )

    expect(partCounts).toMatchObject({ 'cendana-college': 5, 'saga-college': 6, 'elm-college': 3 })
    expect(index.entries.reduce((total, entry) => total + entry.parts.length, 0)).toBe(260)
  })
})

describe('searchBuildings', () => {
  const index = buildBuildingIndex([
    building({ id: 'com1', name: 'COM1', aliases: ['COM 1', 'Computing 1'] }),
    building({ id: 'com3', name: 'COM3', aliases: ['COM 3'] }),
    building({ id: 'computing-drive-carpark', name: 'Computing Drive Carpark' }),
    building({ id: 'saga-college-2', name: 'Saga College', groupKey: 'saga-college' }),
    building({ id: 'saga-college-1', name: 'Saga College', groupKey: 'saga-college' }),
  ])

  it('returns nothing for an empty query', () => {
    expect(searchBuildings(index, '  ')).toEqual([])
  })

  it('finds a building by name, spaced alias and descriptive alias', () => {
    expect(searchBuildings(index, 'com1').map((entry) => entry.id)).toEqual(['com1'])
    expect(searchBuildings(index, 'com 1').map((entry) => entry.id)).toEqual(['com1'])
    expect(searchBuildings(index, 'computing 1').map((entry) => entry.id)).toEqual(['com1'])
  })

  it('ranks exact matches before prefix matches, then by ID', () => {
    expect(searchBuildings(index, 'com').map((entry) => entry.id)).toEqual(['com1', 'com3', 'computing-drive-carpark'])
    expect(searchBuildings(index, 'com3').map((entry) => entry.id)).toEqual(['com3'])
  })

  it('returns a repeated-name group once', () => {
    expect(searchBuildings(index, 'saga').map((entry) => [entry.id, entry.parts.length])).toEqual([['saga-college', 2]])
  })

  it('honours the result limit', () => {
    expect(searchBuildings(index, 'com', 2)).toHaveLength(2)
  })
})
