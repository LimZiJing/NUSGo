import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Building, BuildingCatalogue } from '@navus/shared/venue/buildings'
import { buildBuildingIndex } from './building-index'

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
      { id: 'com1', name: 'COM1', aliases: ['COM 1'], parts: [com1] },
    ])
  })

  it('collapses buildings sharing a group key into one entry that keeps every part, ordered by ID', () => {
    const second = building({ id: 'elm-college-2', name: 'Elm College', groupKey: 'elm-college' })
    const first = building({ id: 'elm-college-1', name: 'Elm College', groupKey: 'elm-college' })

    const index = buildBuildingIndex([second, first])

    expect(index.entries).toHaveLength(1)
    expect(index.entries[0]).toMatchObject({ id: 'elm-college', name: 'Elm College' })
    expect(index.entries[0].parts).toEqual([first, second])
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
