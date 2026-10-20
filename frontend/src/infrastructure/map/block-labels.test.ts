import { describe, expect, it } from 'vitest'
import type { Building } from '@navus/shared/venue/buildings'
import { buildBuildingIndex } from '../../domain/venue/building-index'
import { createBlockLabelGeoJson } from './block-labels'

function createBuilding(overrides: Partial<Building> & Pick<Building, 'id' | 'name'>): Building {
  return {
    aliases: [],
    elementId: `element-${overrides.id}`,
    location: { x: 103.7, y: 1.3 },
    roomCodePrefixes: [],
    sourceRefs: [],
    ...overrides,
  }
}

describe('createBlockLabelGeoJson', () => {
  it('labels only navigable parts that have blocks, with the block range as text', () => {
    const index = buildBuildingIndex([
      createBuilding({
        id: 'cendana-15',
        name: 'Cendana College',
        groupKey: 'cendana',
        partLabel: 'Block 15-17',
        blocks: ['15', '16', '17'],
        location: { x: 103.775, y: 1.301 },
      }),
      createBuilding({
        id: 'cendana-entrance',
        name: 'Cendana College',
        groupKey: 'cendana',
        groupRole: 'entrance',
        blocks: ['15'],
        location: { x: 103.776, y: 1.302 },
      }),
      createBuilding({
        id: 'library',
        name: 'Central Library',
        location: { x: 103.773, y: 1.296 },
      }),
      createBuilding({
        id: 'block-5',
        name: 'Block 5 Lecture Hall',
        blocks: ['5'],
        location: { x: 103.774, y: 1.297 },
      }),
      createBuilding({
        id: 'block-a-h',
        name: 'Engineering Annex',
        blocks: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
        location: { x: 103.78, y: 1.299 },
      }),
    ])

    const geoJson = createBlockLabelGeoJson(index.entries)

    expect(geoJson.type).toBe('FeatureCollection')
    expect(geoJson.features.map((feature) => feature.properties.label).sort()).toEqual([
      '15-17',
      '5',
      'A-H',
    ])
  })

  it('uses longitude then latitude as Point coordinates', () => {
    const index = buildBuildingIndex([
      createBuilding({
        id: 'block-5',
        name: 'Block 5 Lecture Hall',
        blocks: ['5'],
        location: { x: 103.774, y: 1.297 },
      }),
    ])

    const [feature] = createBlockLabelGeoJson(index.entries).features

    expect(feature).toEqual({
      type: 'Feature',
      properties: { label: '5' },
      geometry: { type: 'Point', coordinates: [103.774, 1.297] },
    })
  })

  it('returns an empty collection when no building has blocks', () => {
    const index = buildBuildingIndex([
      createBuilding({ id: 'library', name: 'Central Library' }),
    ])

    expect(createBlockLabelGeoJson(index.entries)).toEqual({
      type: 'FeatureCollection',
      features: [],
    })
    expect(createBlockLabelGeoJson([])).toEqual({
      type: 'FeatureCollection',
      features: [],
    })
  })
})
