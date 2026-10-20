import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Building, BuildingCatalogue } from '@navus/shared/venue/buildings'
import { buildBuildingIndex, describeBuildingEntry, formatBlockLabel, searchBuildings } from './building-index'

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
        buildings: [com1],
        blocks: [],
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

describe('building groups with labels and an entrance', () => {
  const helix = [
    building({ id: 'helix-house', name: 'Helix House', groupKey: 'helix-house', groupRole: 'entrance', location: { x: 103.0, y: 1.0 } }),
    building({ id: 'helix-a', name: 'Helix House', groupKey: 'helix-house', partLabel: 'Blocks 15-17', blocks: ['15', '16', '17'], location: { x: 103.1, y: 1.1 } }),
    building({ id: 'helix-b', name: 'Helix House', groupKey: 'helix-house', partLabel: 'Blocks 18-19', blocks: ['18', '19'], location: { x: 103.2, y: 1.2 } }),
  ]

  it('excludes the entrance from the buildings, resolves to it and summarises every block', () => {
    const entry = buildBuildingIndex(helix).entries[0]

    expect(entry.parts).toHaveLength(3)
    expect(entry.buildings.map((part) => part.id)).toEqual(['helix-a', 'helix-b'])
    expect(entry.entrance?.id).toBe('helix-house')
    expect(entry.location).toEqual({ x: 103.0, y: 1.0 })
    expect(entry.blocks).toEqual(['15', '16', '17', '18', '19'])
    expect(entry.blockLabel).toBe('Blocks 15-19')
  })

  it('falls back to the building nearest the centre when no entrance is marked', () => {
    const entry = buildBuildingIndex(helix.slice(1)).entries[0]

    expect(entry.entrance).toBeUndefined()
    expect(entry.buildings).toHaveLength(2)
    expect(entry.buildings.map((part) => part.location)).toContainEqual(entry.location)
  })

  it('describes a group by building count and block range, and a single building by address', () => {
    const [entry] = buildBuildingIndex(helix).entries
    expect(describeBuildingEntry(entry)).toBe('2 buildings · Blocks 15-19')

    const [single] = buildBuildingIndex([building({ id: 'com1', name: 'COM1', address: '13 Computing Drive' })]).entries
    expect(describeBuildingEntry(single)).toBe('13 Computing Drive')
  })

  it('finds a group by block number and by name with block number', () => {
    const index = buildBuildingIndex(helix)
    expect(searchBuildings(index, 'Block 16').map((entry) => entry.id)).toEqual(['helix-house'])
    expect(searchBuildings(index, 'helix house block 19').map((entry) => entry.id)).toEqual(['helix-house'])
    expect(searchBuildings(index, 'Block 20')).toEqual([])
  })

  it('formats block ranges', () => {
    expect(formatBlockLabel([])).toBeUndefined()
    expect(formatBlockLabel(['5'])).toBe('Block 5')
    expect(formatBlockLabel(['1', '3'])).toBe('Blocks 1, 3')
    expect(formatBlockLabel(['1', '2', '3', '7'])).toBe('Blocks 1-3, 7')
    expect(formatBlockLabel(['A', 'B', 'C', 'D'])).toBe('Blocks A-D')
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

describe('the real catalogue', () => {
  const catalogue = JSON.parse(readFileSync('public/data/buildings.json', 'utf8')) as BuildingCatalogue
  const index = buildBuildingIndex(catalogue.buildings)

  it('shows Helix House once, as two buildings across blocks 15-19', () => {
    const matches = searchBuildings(index, 'Helix House')
    expect(matches).toHaveLength(1)
    expect(describeBuildingEntry(matches[0])).toBe('2 buildings · Blocks 15-19')
    expect(matches[0].buildings.map((part) => part.partLabel)).toEqual(['Blocks 15-17', 'Blocks 18-19'])
    expect(searchBuildings(index, 'Block 16').map((entry) => entry.id)).toContain('helix-house')
  })

  it('summarises Ridge View as blocks A-G with the tower as block F', () => {
    const entry = index.byId.get('ridge-view-residential-college')
    expect(entry?.blockLabel).toBe('Blocks A-G')
    expect(entry?.buildings.map((part) => part.partLabel)).toContain('Tower (Block F)')
  })

  it('shows Sheares Hall and Temasek Hall once each, with blocks A-E', () => {
    for (const name of ['Sheares Hall', 'Temasek Hall']) {
      const matches = searchBuildings(index, name).filter((entry) => entry.name === name)
      expect(matches).toHaveLength(1)
      expect(matches[0].blockLabel).toBe('Blocks A-E')
    }
  })

  it('shows University Hall once, as two wings reached through the main record', () => {
    const entry = index.byId.get('university-hall')
    expect(entry?.entrance?.id).toBe('university-hall')
    expect(entry?.buildings.map((part) => part.partLabel)).toEqual(['Lee Kong Chian Wing', 'Tan Chin Tuan Wing'])
  })

  it('has no two entries with the same name and address', () => {
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const entry of index.entries) {
      const key = `${entry.name}|${describeBuildingEntry(entry)}`
      const other = seen.get(key)
      if (other) clashes.push(`${other} / ${entry.id}`)
      seen.set(key, entry.id)
    }
    expect(clashes).toEqual([])
  })
})
